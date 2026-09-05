/**
 * One provider's editor card, hand-written for the DeepSeek adapter: the
 * primary field is a single write-only **API key** input (the page never
 * asks for an environment-variable name — a typed key stores through
 * `credentials.set` under the profile's reference, deriving `<ROUTE>_API_KEY`
 * when the profile has none); the collapsed 自定义设置 area carries the
 * curated extras (`baseURL`, DeepSeek's id/name/context-window model
 * catalog).
 * Reasoning effort is deliberately absent: it is a per-MODEL capability, and
 * the models under one provider disagree about it, so a provider-scoped
 * control can only be set to a value some of them reject. The composer's
 * model picker offers each model its own levels; `settings.yaml` keeps the
 * profile field for a deployment that knows its route. Everything else stays
 * owned by `settings.yaml`. Profile edits land as minimal `settings.mutate`
 * path ops against the stored section — the card names only the fields it can
 * see instead of rebuilding the whole subtree from a partial descriptor.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useState becomes an instance field, the credential-describe useEffect
 * becomes connectedCallback/disconnectedCallback (the `stale` guard becomes
 * an epoch counter), and useMemo becomes a plain recompute cached behind a
 * last-inputs identity check. Re-render is an explicit applyDiff(this, vdom)
 * call (Toast.tsx's pattern).
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  DeepSeekModelsEditor, modelDrafts, validateDeepSeekModels,
} from './DeepSeekModelsEditor.js'
import { apiKeyFailure } from './apiKey.js'
import { EditorFooter } from './EditorFooter.js'
import { deriveKeyRef, messageOf } from './store.js'
import styles from './ModelsSection.css.js'

/** The public DeepSeek endpoint shown as the deepseek base-URL placeholder. */
const DEEPSEEK_PUBLIC_BASE_URL = 'https://api.deepseek.com'

/** A user-section subtree as a plain draft object (absent → empty). */
function draftAt(
  schema,
  namespace,
  path,
) {
  const subtree = schema.getPath(namespace.user, path)
  if (typeof subtree !== 'object' || subtree === null || Array.isArray(subtree)) return {}
  return structuredClone(subtree)
}

/**
 * The minimal path ops carrying `after` over `before`, both as the card sees
 * them. Only keys the card observed are named; fields absent from both sides
 * produce no op, which is why edits are path-addressed rather than a rebuilt
 * section.
 * @param base - path of the edited subtree inside the user section.
 * @param before - the subtree as loaded, or undefined when it is new.
 * @param after - the subtree as edited.
 * @returns ordered set/unset ops; empty when nothing changed.
 */
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

/** The editor layout the owning namespace selects. */
function layoutOf(ns) {
  if (ns === 'llm-deepseek') return 'deepseek'
  return 'unknown'
}

/** The credential reference this profile resolves keys through. */
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

/** One provider's editing card, as a webjsx custom element. */
export class FreddieProviderEditor extends HTMLElement {
  #props = DEFAULT_PROPS
  #draft = {}
  #keyDraft = ''
  #keyState = undefined
  #busy = false
  #failure = undefined
  // A settings success advances both retry baselines immediately. Keeping the
  // derived fields in the draft prevents a pushed namespace refresh from
  // turning them into deletions when the following credential write is retried.
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
    // The key state is a placeholder hint, not a precondition for editing:
    // neither a business rejection nor a transport failure may reach the
    // browser as an unhandled rejection, so the card simply renders without
    // the "already configured" hint.
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
    // A value of nothing but whitespace is cleared, not stored: `stringAt`
    // already reports it as absent, so the field would otherwise render empty
    // while the draft still carried the spaces into `settings.yaml`, where
    // both adapters would accept that non-empty string as a real value.
    const value = next === undefined || next.trim().length === 0 ? undefined : next
    this.#draft = value === undefined
      ? schema.deletePath(this.#draft, [key])
      : schema.setPath(this.#draft, [key], value)
  }

  /**
   * The write for this card, or a failure message. Every edit travels as
   * path ops against the STORED section: the draft comes from the redacted
   * descriptor, so a wholesale replace rebuilt from it could delete fields
   * outside the card. Ops name only the fields this card can see.
   */
  async #applyOnce() {
    const { schema, namespace, settingsPath, api, provider, t } = this.#props
    const ns = namespace.ns
    const keyRef = refFor(schema, namespace, settingsPath, provider)
    const keyValue = this.#keyDraft.trim()
    const next = this.#draft
    const root = this.#root ?? schema.rehydrate(namespace.schema)
    const node = schema.nodeAtPath(root, settingsPath)
    if (this.#props.credentialOnly !== true) {
      // The same checker gates the submit button, so a card cannot reach this
      // with a bad row; it stays because the schema check below would refuse
      // the write with a message naming a path instead of the row, and because
      // nothing but this function decides what is written.
      const failure = validateDeepSeekModels(schema.getPath(next, ['models']))
      /* v8 ignore next 3 -- unreachable from the card: the same failure disables submit */
      if (failure !== undefined) {
        return `${t('model')} ${String(failure.index + 1)}: ${t(failure.key)}`
      }
    }
    /* v8 ignore next -- apply is only reachable from the rendered card, which required a resolved node */
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
      // A transport failure (disconnect, a request the host refuses) rejects
      // rather than answering; without this the card would stay busy forever
      // with no error shown.
      this.#failure = messageOf(error)
    } finally {
      this.#busy = false
      this.#render()
    }
  }

  /**
   * The catalog beneath the user layer: what the composition entry pinned, or
   * else the schema default that `resolve` would supply. The effective value
   * cannot answer this — it still carries the stored override until the unset
   * is applied, so reading it would echo that override straight back the
   * moment reset drops it, leaving the rows unchanged until a reload.
   */
  #inheritedModels() {
    const { schema, namespace, settingsPath } = this.#props
    const pinned = schema.getPath(namespace.base, [...settingsPath, 'models'])
    const root = this.#root ?? schema.rehydrate(namespace.schema)
    return pinned ?? (schema.nodeAtPath(root, [...settingsPath, 'models']))?.meta.default
  }

  /**
   * The curated fields of one known adapter family. The family arrives
   * narrowed so the per-family branches below are total: an unknown namespace
   * renders the hint instead and never reaches this body.
   */
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
          onchange: (event) => { this.#keyDraft = event.target.value; this.#render() },
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
              onchange: (event) => {
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
      // A directory entry addressing a position its schema cannot resolve is a
      // host-side inconsistency; showing it beats a blank card.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-provider-editor') === undefined) {
  customElements.define('freddie-provider-editor', FreddieProviderEditor)
}

/**
 * Create (if needed) or update a ProviderEditor element in place.
 * @param el - an existing element to update, or null to create one.
 * @param props - see {@link ProviderEditorProps}.
 * @returns the element; keep it and pass it back in to update.
 */
export function renderProviderEditor(el, props) {
  const target = el ?? document.createElement('freddie-provider-editor')
  target.setProps(props)
  return target
}

/**
 * Render one provider's editing card.
 * @param props - the addressed profile plus wire faces and copy.
 * @returns the editor card, cast for JSX use (Modal.tsx's pattern).
 */
export function ProviderEditor(props) {
  return renderProviderEditor(null, props)
}
