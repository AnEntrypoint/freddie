import { applyDiff, createElement as h } from '@freddie/webjsx'
import { Button, IconPlusOutline16, renderModal, defineElement } from '@freddie/freddie-client-ui-primitives'
import { deriveKeyRef, messageOf, providerUsable } from './store.js'
import { ProviderEditor } from './ProviderEditor.js'
import styles from './ModelsSection.css.js'

function renderProviderEditorCard({ target, ...props }) {
  return h(ProviderEditor, {
    provider: target.provider,
    displayName: target.displayName,
    settingsPath: target.settingsPath,
    ...target.declared === true ? { declared: true } : {},
    ...props,
  })
}

export async function removeProviderProfile(
  api,
  controller,
  target,
) {
  try {
    if (target.credentialRef !== undefined) {
      const credential = await api.credentials.unset({ ref: target.credentialRef })
      if (!credential.result.ok) return credential.result.error.message
    }
    const response = await api.settings.mutate({
      ns: target.settingsNs,
      ops: [{ op: 'unset', path: [...target.settingsPath] }],
    })
    if (!response.result.ok) return response.result.error.message
  } catch (error) {
    return messageOf(error)
  }
  await controller.load()
  return undefined
}

export function needsSetup(row, anyUsable) {
  if (anyUsable) return false
  if (row.entry.settingsPath.length > 0) return false
  return row.credential?.configured !== true
}

function targetOf(row) {
  const managedRef = deriveKeyRef(row.entry.provider)
  const credentialRef = row.apiKeyEnv === managedRef
    && row.credential?.configured === true
    && row.credential.writable
    ? managedRef
    : undefined
  return {
    provider: row.entry.provider,
    displayName: row.entry.displayName,
    settingsNs: row.entry.settingsNs,
    settingsPath: row.entry.settingsPath,
    ...credentialRef === undefined ? {} : { credentialRef },
    ...row.entry.declared === true ? { declared: true } : {},
  }
}

export function providerTargetLabel(target) {
  return target.provider === target.displayName
    ? target.provider
    : `${target.displayName} (${target.provider})`
}

export function providerCopy(template, target) {
  return template.replace('{provider}', () => providerTargetLabel(target))
}

export function ModelsSection(props) {
  const { controller, useSnapshot, api, schema, t } = props
  if (
    controller === undefined || useSnapshot === undefined || api === undefined
    || schema === undefined || t === undefined
  ) return null
  return renderModelsSectionLoaded(null, { controller, useSnapshot, api, schema, t })
}

const DEFAULT_LOADED_PROPS = {}

export class FreddieModelsSectionLoaded extends HTMLElement {
  #injected = DEFAULT_LOADED_PROPS
  #editing = undefined
  #adding = false
  #deleteTarget = undefined
  #deleting = false
  #deleteFailure = undefined
  #savedTarget = undefined
  #dismissedSetup = new Set()
  #deleteModal = null

  setProps(injected) {
    this.#injected = injected
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#deleteModal?.remove()
    this.#deleteModal = null
  }

  #announceSaved(target) {
    void this.#injected.controller.load().then(() => { this.#savedTarget = target; this.#render() })
  }

  #closeEditor(changed, target) {
    this.#editing = undefined
    this.#adding = false
    if (changed) this.#announceSaved(target)
    this.#render()
  }

  #closeSetup(changed, target) {
    this.#dismissedSetup = new Set([...this.#dismissedSetup, target.provider])
    if (changed) this.#announceSaved(target)
    this.#render()
  }

  #closeDelete() {
    if (this.#deleting) return
    this.#deleteTarget = undefined
    this.#deleteFailure = undefined
    this.#render()
  }

  #confirmDelete() {
    const { api, controller } = this.#injected
    if (this.#deleteTarget === undefined || this.#deleting) return
    this.#deleting = true
    this.#deleteFailure = undefined
    this.#render()
    void removeProviderProfile(api, controller, this.#deleteTarget)
      .then((failure) => {
        if (failure !== undefined) {
          this.#deleteFailure = failure
          return
        }
        this.#deleteTarget = undefined
      })
      .finally(() => { this.#deleting = false; this.#render() })
  }

  #render() {
    const injected = this.#injected
    const { controller, api, schema, t } = injected
    const state = injected.useSnapshot(snapshot => snapshot)

    if (state.status === 'idle') void controller.load()
    if (state.status === 'error') {
      const errorText = state.error ?? ''
      applyDiff(this, h('div', { class: styles['section'] ?? '' },
        h('p', { class: styles['error'] ?? '' }, `${t('loadFailed')}: ${errorText}`),
        h('button', {
          type: 'button',
          class: styles['secondaryButton'] ?? '',
          onclick: () => { void controller.load() },
        }, t('retry')),
      ))
      if (this.#deleteModal !== null) {
        this.#deleteModal = renderModal(this.#deleteModal, {
          open: false,
          onClose: () => { this.#closeDelete() },
          title: '',
          closeLabel: t('close'),
        })
      }
      return
    }

    const savedRow = this.#savedTarget === undefined
      ? undefined
      : state.rows.find(row => row.entry.provider === this.#savedTarget?.provider)
    const savedIdentity = savedRow === undefined
      ? this.#savedTarget
      : { provider: savedRow.entry.provider, displayName: savedRow.entry.displayName }

    const anyUsable = state.rows.some(providerUsable)
    const configured = state.rows.filter(row => row.configured)
    const addable = state.rows.filter(row => !row.configured && row.entry.settingsNs !== '')
    const addTarget = this.#adding ? this.#editing : undefined
    const addNamespace = addTarget === undefined ? undefined : state.namespaces.get(addTarget.settingsNs)

    const vdom = h('div', { class: styles['section'] ?? '' },
      h('h2', { class: styles['title'] ?? '' }, t('title')),
      h('p', { class: styles['intro'] ?? '' }, t('intro')),
      !state.writable && state.status === 'ready' ? h('p', { class: styles['notice'] ?? '' }, t('readOnly')) : null,
      savedIdentity === undefined
        ? null
        : h('p', { class: styles['savedNotice'] ?? '', role: 'status', 'aria-live': 'polite' },
          providerCopy(t('savedProvider'), savedIdentity)),
      h('ul', { class: styles['rows'] ?? '' },
        configured.map((row) => {
          const target = targetOf(row)
          const namespace = state.namespaces.get(target.settingsNs)
          if (namespace === undefined) return null
          if (needsSetup(row, anyUsable) && !this.#dismissedSetup.has(row.entry.provider)) {
            return h('li', { key: row.entry.provider, class: styles['setupCard'] ?? '' },
              renderProviderEditorCard({
                target,
                namespace,
                schema,
                api,
                t,
                readOnly: !state.writable,
                onClose: (changed) => { this.#closeSetup(changed, target) },
              }),
            )
          }
          const open = !this.#adding && this.#editing?.provider === row.entry.provider
          const credentialConfigured = row.credential?.configured === true
          const credentialMissing = !credentialConfigured
            && row.apiKeyEnv !== undefined
            && row.credential?.configured === false
          return h('li', { key: row.entry.provider, class: styles['rowCard'] ?? '' },
            h('div', { class: styles['rowHead'] ?? '' },
              h('span', { class: styles['rowIdentity'] ?? '' },
                h('span', { class: styles['rowName'] ?? '' }, row.entry.displayName),
                row.entry.declared === true
                  ? h('span', { class: styles['rowTag'] ?? '' }, t('customTag'))
                  : null,
                credentialConfigured
                  ? h('span', {
                    class: `${styles['credentialDot'] ?? ''} ${styles['credentialDotConfigured'] ?? ''}`,
                    role: 'img',
                    'aria-label': t('credentialConfigured'),
                    title: t('credentialConfigured'),
                  })
                  : credentialMissing
                    ? h('span', {
                      class: `${styles['credentialDot'] ?? ''} ${styles['credentialDotMissing'] ?? ''}`,
                      role: 'img',
                      'aria-label': t('credentialMissing'),
                      title: t('credentialMissing'),
                    })
                    : null,
              ),
              h('span', { class: styles['rowActions'] ?? '' },
                h('button', {
                  type: 'button',
                  class: styles['secondaryButton'] ?? '',
                  'aria-label': providerCopy(t('editProvider'), target),
                  onclick: () => {
                    this.#savedTarget = undefined
                    this.#adding = false
                    this.#editing = open ? undefined : target
                    this.#render()
                  },
                }, t('edit')),
                row.removable
                  ? h('button', {
                    type: 'button',
                    class: styles['dangerButton'] ?? '',
                    'aria-label': providerCopy(t('removeProvider'), target),
                    disabled: !state.writable,
                    onclick: () => {
                      this.#savedTarget = undefined
                      this.#deleteFailure = undefined
                      this.#deleteTarget = target
                      this.#render()
                    },
                  }, t('remove'))
                  : null,
              ),
            ),
            open
              ? renderProviderEditorCard({
                target,
                namespace,
                schema,
                api,
                t,
                readOnly: !state.writable,
                onClose: (changed) => { this.#closeEditor(changed, target) },
              })
              : null,
          )
        }),
      ),
      h('div', { class: styles['addBlock'] ?? '' },
        addTarget !== undefined && addNamespace !== undefined
          ? h('div', { class: styles['addCard'] ?? '' },
            h('div', { class: styles['field'] ?? '' },
              h('span', { class: styles['fieldLabel'] ?? '' }, t('provider')),
              h('select', {
                class: `${styles['input'] ?? ''} ${styles['selectInput'] ?? ''}`,
                value: addTarget.provider,
                'aria-label': t('provider'),
                onchange: (event) => {
                  const value = event.target.value
                  const row = addable.find(candidate => candidate.entry.provider === value)
                  if (row === undefined) return
                  this.#editing = targetOf(row)
                  this.#render()
                },
              },
              addable.map(row => (
                h('option', { key: row.entry.provider, value: row.entry.provider }, row.entry.displayName)
              )),
              ),
            ),
            h(ProviderEditor, {
              key: addTarget.provider,
              provider: addTarget.provider,
              displayName: addTarget.displayName,
              hideTitle: true,
              namespace: addNamespace,
              schema,
              settingsPath: addTarget.settingsPath,
              api,
              t,
              readOnly: !state.writable,
              onClose: (changed) => { this.#closeEditor(changed, addTarget) },
            }),
          )
          : h('div', { class: styles['addActions'] ?? '' },
            h('button', {
              type: 'button',
              class: styles['addButton'] ?? '',
              disabled: addable.length === 0 || !state.writable,
              onclick: () => {
                const first = addable[0]
                if (first === undefined) return
                this.#savedTarget = undefined
                this.#adding = true
                this.#editing = targetOf(first)
                this.#render()
              },
            },
            h(IconPlusOutline16, { size: 14 }),
            t('add'),
            ),
          ),
      ),
    )
    applyDiff(this, vdom)
    this.#deleteModal = renderModal(this.#deleteModal, {
      open: this.#deleteTarget !== undefined,
      onClose: () => { this.#closeDelete() },
      title: this.#deleteTarget === undefined ? '' : providerCopy(t('deleteTitle'), this.#deleteTarget),
      closeLabel: t('close'),
      description: this.#deleteTarget === undefined
        ? ''
        : providerCopy(
          this.#deleteTarget.credentialRef === undefined
            ? t('deleteDescription')
            : t('deleteDescriptionWithCredential'),
          this.#deleteTarget,
        ),
      className: styles['deleteDialog'],
      footer: [
        h(Button, {
          variant: 'outline', autoFocus: true, disabled: this.#deleting, onclick: () => { this.#closeDelete() },
        }, t('cancel')),
        h(Button, {
          variant: 'outline',
          class: styles['deleteConfirm'],
          disabled: this.#deleting,
          onclick: () => { this.#confirmDelete() },
        },
        this.#deleteTarget === undefined
          ? ''
          : providerCopy(this.#deleting ? t('deleting') : t('deleteConfirm'), this.#deleteTarget),
        ),
      ],
      children: this.#deleteFailure === undefined ? null : h('p', { class: styles['error'] ?? '' }, this.#deleteFailure),
    })
  }
}

defineElement('freddie-models-section-loaded', FreddieModelsSectionLoaded)

export function renderModelsSectionLoaded(
  el,
  injected,
) {
  const target = el ?? document.createElement('freddie-models-section-loaded')
  target.setProps(injected)
  return target
}
