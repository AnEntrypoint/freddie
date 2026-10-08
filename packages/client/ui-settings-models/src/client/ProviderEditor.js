import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import {
  DeepSeekModelsEditor, modelDrafts, validateDeepSeekModels,
} from './DeepSeekModelsEditor.js'
import { apiKeyFailure } from './apiKey.js'
import { EditorFooter } from './EditorFooter.js'
import { deriveKeyRef, messageOf } from './store.js'
import styles from './ModelsSection.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const DEEPSEEK_PUBLIC_BASE_URL = 'https://api.deepseek.com'

function draftAt(
  schema,
  namespace,
  path,
) {
  const subtree = schema.getPath(namespace.user, path)
  if (typeof subtree !== 'object' || subtree === null || Array.isArray(subtree)) return {}
  return structuredClone(subtree)
}

export function pathOps(
  base,
  before,
  after,
) {
  const previous = typeof before === 'object' && before !== null && !Array.isArray(before)
    ? before
    : {}
  const ops = []
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(previous[key]) === JSON.stringify(value)) continue
    ops.push({ op: 'set', path: [...base, key], value })
  }
  for (const key of Object.keys(previous)) {
    if (!(key in after)) ops.push({ op: 'unset', path: [...base, key] })
  }
  return ops
}

function layoutOf(ns) {
  if (ns === 'llm-deepseek') return 'deepseek'
  return 'unknown'
}

function refFor(
  schema,
  namespace,
  path,
  provider,
) {
  const profile = schema.getPath(namespace.value, path)
  const named = typeof profile === 'object' && profile !== null
    ? profile.apiKeyEnv
    : undefined
  return typeof named === 'string' && named.length > 0 ? named : deriveKeyRef(provider)
}

const DEFAULT_PROPS = {
  provider: '',
  displayName: '',
  namespace: {},
  schema: {},
  settingsPath: [],
  api: {},
  t: key => key,
  readOnly: false,
  onClose: () => {},
}

export class FreddieProviderEditor extends HTMLElement {
  #props = DEFAULT_PROPS
  #draft = {}
  #keyDraft = ''
  #keyState = undefined
  #busy = false
  #failure = undefined
  #committedOriginal = undefined
  #expectedRevision = 0
  #credentialEpoch = 0
  #lastNamespaceSchema = undefined
  #root = undefined

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    const { schema, namespace, settingsPath } = this.#props
    this.#draft = draftAt(schema, namespace, settingsPath)
    this.#committedOriginal = schema.getPath(namespace.user, settingsPath)
    this.#expectedRevision = namespace.revision
    this.#loadKeyState()
    this.#render()
  }

  disconnectedCallback() {
    this.#credentialEpoch += 1
  }

  #loadKeyState() {
    const { api, schema, namespace, settingsPath, provider } = this.#props
    const keyRef = refFor(schema, namespace, settingsPath, provider)
    const epoch = ++this.#credentialEpoch
    this.#keyState = undefined
    void api.credentials.describe({ refs: [keyRef] }).then(
      (response) => {
        if (epoch !== this.#credentialEpoch || !response.result.ok) return
        this.#keyState = response.result.value.credentials[keyRef]
        this.#render()
      },
      () => undefined,
    )
  }

  #stringAt(source, key) {
    const value = this.#props.schema.getPath(source, [key])
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
  }

  #setField(key, next) {
    const { schema } = this.#props
    const value = next === undefined || next.trim().length === 0 ? undefined : next
    this.#draft = value === undefined
      ? schema.deletePath(this.#draft, [key])
      : schema.setPath(this.#draft, [key], value)
  }

  async #applyOnce() {
    const { schema, namespace, settingsPath, api, provider, t } = this.#props
    const ns = namespace.ns
    const keyRef = refFor(schema, namespace, settingsPath, provider)
    const keyValue = this.#keyDraft.trim()
    const next = this.#draft
    const root = this.#root ?? schema.rehydrate(namespace.schema)
    const node = schema.nodeAtPath(root, settingsPath)
    if (this.#props.credentialOnly !== true) {
      const failure = validateDeepSeekModels(schema.getPath(next, ['models']))
      if (failure !== undefined) {
        return `${t('model')} ${String(failure.index + 1)}: ${t(failure.key)}`
      }
    }
    if (this.#props.credentialOnly !== true && node !== undefined && settingsPath.length === 0) {
      const sectionError = schema.validate(node, next)
      if (sectionError !== undefined) return sectionError
    }
    const ops = this.#props.credentialOnly === true
      ? []
      : pathOps(settingsPath, this.#committedOriginal, next)
    if (ops.length > 0) {
      const response = await api.settings.mutate({ ns, ops, expectedRevision: this.#expectedRevision })
      if (!response.result.ok) {
        return response.result.error.code === 'settings-conflict'
          ? t('conflict')
          : response.result.error.message
      }
      this.#committedOriginal = schema.getPath(response.result.value.user, settingsPath)
      this.#expectedRevision = response.result.value.revision
      this.#draft = next
    }
    if (keyValue.length > 0) {
      const stored = await api.credentials.set({ ref: keyRef, value: keyValue })
      if (!stored.result.ok) return stored.result.error.message
    }
    this.#keyDraft = ''
    return undefined
  }

  async #apply() {
    this.#busy = true
    this.#failure = undefined
    this.#render()
    try {
      const failure = await this.#applyOnce()
      if (failure !== undefined) {
        this.#failure = failure
        return
      }
      this.#props.onClose(true)
    } catch (error) {
      this.#failure = messageOf(error)
    } finally {
      this.#busy = false
      this.#render()
    }
  }

  #inheritedModels() {
    const { schema, namespace, settingsPath } = this.#props
    const pinned = schema.getPath(namespace.base, [...settingsPath, 'models'])
    const root = this.#root ?? schema.rehydrate(namespace.schema)
    return pinned ?? (schema.nodeAtPath(root, [...settingsPath, 'models']))?.meta.default
  }

  #curatedFields() {
    const props = this.#props
    const { schema, namespace, settingsPath, t } = props
    const disabled = props.readOnly || this.#busy
    const fallback = schema.getPath(namespace.value, settingsPath)
    const keyLocked = this.#keyState?.writable === false
    const customModels = schema.getPath(this.#draft, ['models'])
    const modelsOverridden = schema.hasPath(this.#draft, ['models'])
    const models = modelDrafts(modelsOverridden ? customModels : this.#inheritedModels())
    const defaultContextWindow = schema.getPath(fallback, ['defaultContextWindow'])
    const defaultMaxTokens = schema.getPath(fallback, ['maxTokens'])
    const keyPlaceholder = keyLocked
      ? t('keyEnvLocked')
      : this.#keyState?.configured === true && props.credentialRequired !== true
        ? t('keyStored')
        : t('keyPlaceholder')
    const keyFailure = apiKeyFailure(this.#keyDraft)
    const keyValue = this.#keyDraft.trim()
    const credentialRequiredFailure = props.credentialRequired === true
      && this.#keyDraft.length > 0 && keyValue.length === 0
      ? 'keyRequired'
      : undefined
    const shownKeyFailure = credentialRequiredFailure ?? keyFailure
    const catalogProps = {
      models,
      overridden: modelsOverridden,
      t,
      disabled,
      onChange: (next) => {
        this.#draft = schema.setPath(this.#draft, ['models'], next)
        this.#render()
      },
      onReset: () => {
        this.#draft = schema.deletePath(this.#draft, ['models'])
        this.#render()
      },
    }
    return h(Fragment, null,
      h('div', { class: styles['field'] ?? '' },
        h('span', { class: styles['fieldLabel'] ?? '' }, t('keyInput')),
        h('input', {
          class: styles['input'] ?? '',
          type: 'password',
          autocomplete: 'off',
          value: this.#keyDraft,
          placeholder: keyPlaceholder,
          'aria-label': t('keyInput'),
          'aria-invalid': shownKeyFailure !== undefined,
          required: props.credentialRequired === true,
          autofocus: props.autoFocusCredential === true,
          disabled: disabled || keyLocked,
          oninput: (event) => { this.#keyDraft = event.target.value; this.#render() },
        }),
        shownKeyFailure === undefined ? null : h('p', { class: styles['error'] ?? '' }, t(shownKeyFailure)),
      ),
      props.credentialOnly === true ? null : h('details', { class: styles['customized'] ?? '' },
        h('summary', { class: styles['customizedSummary'] ?? '' }, t('customized')),
        h('div', { class: styles['customizedBody'] ?? '' },
          h('div', { class: styles['field'] ?? '' },
            h('span', { class: styles['fieldLabel'] ?? '' }, t('baseUrl')),
            h('input', {
              class: styles['input'] ?? '',
              type: 'text',
              value: this.#stringAt(this.#draft, 'baseURL') ?? '',
              placeholder: DEEPSEEK_PUBLIC_BASE_URL,
              'aria-label': t('baseUrl'),
              disabled,
              oninput: (event) => {
                const value = event.target.value
                this.#setField('baseURL', value === '' ? undefined : value)
                this.#render()
              },
            }),
          ),
          h(DeepSeekModelsEditor, {
            ...catalogProps,
            defaultContextWindow: typeof defaultContextWindow === 'number'
              ? defaultContextWindow
              : undefined,
            defaultMaxTokens: typeof defaultMaxTokens === 'number' ? defaultMaxTokens : undefined,
          }),
        ),
      ),
    )
  }

  #render() {
    const props = this.#props
    const { schema, namespace, settingsPath, t } = props
    if (this.#lastNamespaceSchema !== namespace.schema) {
      this.#lastNamespaceSchema = namespace.schema
      this.#root = schema.rehydrate(namespace.schema)
    }
    const root = this.#root ?? schema.rehydrate(namespace.schema)
    const node = schema.nodeAtPath(root, settingsPath)
    const layout = layoutOf(namespace.ns)
    const modelFailure = validateDeepSeekModels(schema.getPath(this.#draft, ['models']))

    if (node === undefined) {
      applyDiff(this, h('p', { class: styles['error'] ?? '' }, `${props.provider}: unresolvable settings path`))
      return
    }

    const disabled = props.readOnly || this.#busy
    const keyFailure = apiKeyFailure(this.#keyDraft)
    const keyValue = this.#keyDraft.trim()
    const credentialRequiredFailure = props.credentialRequired === true
      && this.#keyDraft.length > 0 && keyValue.length === 0
      ? 'keyRequired'
      : undefined
    const shownKeyFailure = credentialRequiredFailure ?? keyFailure

    const vdom = h('div', { class: props.credentialOnly === true ? styles['addBlock'] ?? '' : styles['editor'] ?? '' },
      props.hideTitle === true
        ? null
        : h('div', { class: styles['editorHeader'] ?? '' },
          h('span', { class: styles['editorTitle'] ?? '' }, props.displayName),
          props.provider !== props.displayName
            ? h('span', { class: styles['editorRoute'] ?? '' }, props.provider)
            : null,
        ),
      layout === 'unknown'
        ? h('p', { class: styles['advancedHint'] ?? '' }, `${t('advancedHint')} (${namespace.ns})`)
        : this.#curatedFields(),
      this.#failure !== undefined ? h('p', { class: styles['error'] ?? '' }, this.#failure) : null,
      props.credentialOnly === true || modelFailure === undefined
        ? null
        : h('p', { class: styles['advancedHint'] ?? '' },
          `${t('model')} ${String(modelFailure.index + 1)}: ${t(modelFailure.key)}`),
      h(EditorFooter, {
        t,
        busy: this.#busy,
        submitDisabled: disabled || layout === 'unknown'
          || (props.credentialOnly !== true && modelFailure !== undefined)
          || shownKeyFailure !== undefined
          || (props.credentialRequired === true && keyValue.length === 0),
        submitLabel: props.submitLabel ?? 'apply',
        submitBusyLabel: props.submitBusyLabel ?? 'applying',
        ...props.cancelLabel === undefined ? {} : { cancelLabel: props.cancelLabel },
        onCancel: () => { props.onClose(false) },
        onSubmit: () => { void this.#apply() },
      }),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-provider-editor', FreddieProviderEditor)

export function renderProviderEditor(el, props) {
  const target = el ?? document.createElement('freddie-provider-editor')
  target.setProps(props)
  return target
}

export function ProviderEditor(props) {
  return renderProviderEditor(null, props)
}
