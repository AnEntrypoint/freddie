
import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import {
  Button, IconBrowseOutline16, IconCopyOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16,
  renderModal, renderTooltip,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { draftBlocker } from './section-store.js'
import { presetDisplayText } from './locales.js'
import css from './AgentPresetSection.css.js'

export class FreddieAgentPresetSection extends HTMLElement {
  #props = null
  #copyModal = null
  #viewModal = null
  #deleteModal = null
  #descriptionTooltips = new Map()
  #descriptionTruncated = new Map()
  #descriptionResizeObservers = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    for (const observer of this.#descriptionResizeObservers.values()) observer.disconnect()
    this.#descriptionResizeObservers.clear()
  }

  #trackDescription(rowId, el) {
    if (el === null) return
    const measure = () => {
      const next = el.scrollHeight > el.clientHeight
      if (this.#descriptionTruncated.get(rowId) === next) return
      this.#descriptionTruncated.set(rowId, next)
      this.#render()
    }
    measure()
    if (this.#descriptionResizeObservers.has(rowId)) return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    this.#descriptionResizeObservers.set(rowId, observer)
  }

  #renderDescription(rowId, text) {
    const truncated = this.#descriptionTruncated.get(rowId) ?? false
    const existing = this.#descriptionTooltips.get(rowId) ?? null
    const tooltip = renderTooltip(existing, {
      label: text,
      side: 'bottom',
      delayMs: 400,
      disabled: !truncated,
      maxWidth: 360,
      children: (
        h('span', {
          class: css.cardDesc ?? '',
          title: '',
          ref: (node) => { this.#trackDescription(rowId, node) },
        },
          text,
        )
      ),
    })
    this.#descriptionTooltips.set(rowId, tooltip)
    return tooltip
  }

  #renderCopyModal(state, t) {
    const props = this.#props
    if (props === null) return
    const draft = state.copy
    const blocker = draft === null ? undefined : draftBlocker(draft, state.rows)
    const message = draft === null ? null : draft.error ?? (blocker === undefined ? null : t(blocker))
    const source = draft === null ? undefined : state.rows.find(row => row.id === draft.from)
    const sourceTitle = source === undefined ? draft?.fromTitle : presetDisplayText(source, t).name

    this.#copyModal = renderModal(this.#copyModal, {
      open: draft !== null,
      onClose: () => { props.cancelCopy() },
      title: draft === null ? t('copyTitle') : `${t('copyTitle')} · ${t('copyOf')} ${sourceTitle}`,
      closeLabel: t('close'),
      description: t('copyIntro'),
      className: css.dialog ?? '',
      footer: [
        h(Button, {
          variant: 'outline',
          disabled: draft?.saving === true,
          onclick: () => { props.cancelCopy() },
        },
          t('cancel'),
        ),
        h(Button, {
          disabled: draft === null || draft.saving || blocker !== undefined,
          onclick: () => { void props.confirmCopy() },
        },
          draft?.saving === true ? t('creating') : t('create'),
        ),
      ],
      children: draft === null
        ? null
        : (
          h('div', {class: css.dialogFields ?? ''},
            h('label', {class: css.field ?? ''},
              h('span', {class: css.fieldLabel ?? ''}, t('presetId')),
              h('input', {
                class: css.input ?? '',
                value: draft.id,
                autofocus: true,
                spellcheck: 'false',
                placeholder: t('presetIdPlaceholder'),
                oninput: (event) => { props.setCopyId(event.target.value) },
              }),
            ),
            h('label', {class: css.field ?? ''},
              h('span', {class: css.fieldLabel ?? ''}, t('displayName')),
              h('input', {
                class: css.input ?? '',
                value: draft.name,
                spellcheck: 'false',
                placeholder: t('displayNamePlaceholder'),
                oninput: (event) => { props.setCopyName(event.target.value) },
              }),
            ),
            message === null ? null : h('p', {class: css.error ?? '', role: 'alert'}, message),
          )
        ),
    })
  }

  #renderViewModal(state, t) {
    const props = this.#props
    if (props === null) return
    const viewedId = state.view?.id
    const viewedRow = viewedId === undefined ? undefined : state.rows.find(row => row.id === viewedId)
    const viewedTitle = state.view === null
      ? ''
      : viewedRow === undefined ? state.view.title : presetDisplayText(viewedRow, t).name

    this.#viewModal = renderModal(this.#viewModal, {
      open: state.view !== null,
      onClose: () => { props.closeView() },
      title: state.view === null ? '' : `${t('view')} · ${viewedTitle}`,
      closeLabel: t('close'),
      description: t('composition'),
      className: css.dialog ?? '',
      footer: (
        h(Button, {variant: 'outline', autofocus: true, onclick: () => { props.closeView() }},
          t('close'),
        )
      ),
      children: state.view === null
        ? null
        : h('pre', {class: css.viewerCode ?? ''}, state.view.content),
    })
  }

  #renderDeleteModal(state, t) {
    const props = this.#props
    if (props === null) return
    this.#deleteModal = renderModal(this.#deleteModal, {
      open: state.pendingDelete !== null,
      onClose: () => { props.confirmDelete(null) },
      title: t('deleteTitle'),
      closeLabel: t('close'),
      description: t('deleteDescription'),
      className: css.deleteDialog ?? '',
      footer: [
        h(Button, {
          variant: 'outline',
          autofocus: true,
          disabled: state.deleting,
          onclick: () => { props.confirmDelete(null) },
        },
          t('cancel'),
        ),
        h(Button, {
          variant: 'outline',
          class: css.deleteConfirm,
          disabled: state.deleting,
          onclick: () => { void props.remove() },
        },
          state.deleting ? t('deleting') : t('deleteConfirm'),
        ),
      ],
    })
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { useAgentPresetSection, t } = props
    const state = useAgentPresetSection(snapshot => snapshot)
    if (state.status === 'idle') void props.load()

    if (state.status === 'unavailable') {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }
    if (state.status === 'error') {
      const detail = state.error ?? ''
      const vdom = (
        h('div', {class: css.section ?? ''},
          h('p', {class: css.error ?? '', role: 'alert'}, `${t('error')} ${detail}`),
          h('button', {type: 'button', class: css.secondaryButton ?? '', onclick: () => { void props.load() }},
            t('retry'),
          ),
        )
      )
      applyDiff(this, vdom)
      return
    }

    const creatorButton = props.startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis')
      ? (
        h('button', {
          type: 'button',
          class: css.creatorButton ?? '',
          disabled: !state.authorable,
          title: state.authorable ? '' : t('duplicateUnavailable'),
          onclick: () => {
            props.startCreatorDraft?.()
            props.close()
          },
        },
          h(IconPlusOutline16, {size: 14}),
          t('creatorDraft'),
        )
      )
      : null

    const seenRowIds = new Set()

    const vdom = (
      h('div', {class: css.section ?? ''},
        h('h2', {class: css.title ?? ''}, t('nav')),
        h('p', {class: css.intro ?? ''}, t('sectionIntro')),
        state.error === null ? null : h('p', {class: css.error ?? '', role: 'alert'}, state.error),
        ([['system', t('builtInGroup')], ['user', t('customGroup')]]).map(([trust, heading]) => {
          const group = state.rows
            .filter(row => row.trust === trust)
            .map(row => ({ row, text: presetDisplayText(row, t) }))
          const tail = trust === 'user' ? creatorButton : null
          if (group.length === 0 && tail === null) return null
          return (
            h('section', {key: trust, class: css.group ?? ''},
              h('h3', {class: css.groupHead ?? ''}, heading),
              group.length === 0 ? null : (
                h('ul', {class: css.cards ?? ''},
                  group.map(({ row, text }) => {
                    seenRowIds.add(row.id)
                    return (
                      h('li', {
                        key: row.id,
                        class: row.broken !== undefined
                          ? `${css.card} ${css.cardBroken}`
                          : row.isDefault ? `${css.card} ${css.cardActive}` : css.card,
                      },
                        h('button', {
                          type: 'button',
                          class: css.cardMain ?? '',
                          'aria-pressed': String(row.isDefault),
                          disabled: row.isDefault || row.broken !== undefined,
                          'aria-label': `${row.broken !== undefined ? t('brokenBadge') : row.isDefault ? t('inUse') : t('setDefault')}: ${text.name}`,
                          title: row.broken ?? (row.isDefault ? t('inUse') : t('setDefault')),
                          onclick: () => { void props.makeDefault(row.id) },
                        },
                          h('span', {class: css.cardHead ?? ''},
                            h('span', {class: css.cardName ?? ''}, text.name),
                            row.broken !== undefined
                              ? h('span', {class: css.brokenBadge ?? ''}, t('brokenBadge'))
                              : null,
                            h('span', {class: css.badge ?? ''},
                              row.trust === 'user' ? t('userTrust') : t('builtIn'),
                            ),
                            row.isDefault ? h('span', {class: css.inUse ?? ''}, t('inUse')) : null,
                          ),
                          h('span', {'data-desc-slot': row.id}),
                          row.broken === undefined
                            ? null
                            : h('span', {class: css.cardBrokenReason ?? '', role: 'alert'}, row.broken),
                          h('code', {class: css.cardId ?? ''}, row.id),
                        ),
                        h('div', {class: css.cardFoot ?? ''},
                          row.trust === 'system'
                            ? row.broken === undefined
                              ? (
                                h('button', {
                                  type: 'button',
                                  class: css.iconButton ?? '',
                                  'data-tip': t('view'),
                                  'aria-label': `${t('view')}: ${text.name}`,
                                  onclick: () => { void props.view(row.id) },
                                },
                                  h(IconBrowseOutline16, null),
                                )
                              )
                              : null
                            : (
                              h('button', {
                                type: 'button',
                                class: css.iconButton ?? '',
                                'data-tip': state.hasDocument ? t('openLocation') : t('showLocation'),
                                'aria-label': `${state.hasDocument ? t('openLocation') : t('showLocation')}: ${text.name}`,
                                onclick: () => { void props.openLocation(row.id) },
                              },
                                h(IconFolderOpenOutline16, null),
                              )
                            ),
                          h('button', {
                            type: 'button',
                            class: css.iconButton ?? '',
                            disabled: !state.authorable || row.broken !== undefined,
                            'data-tip': row.broken !== undefined
                              ? t('brokenNoCopy')
                              : state.authorable ? t('duplicate') : t('duplicateUnavailable'),
                            'aria-label': `${t('duplicate')}: ${text.name}`,
                            onclick: () => { props.beginCopy(row.id) },
                          },
                            h(IconCopyOutline16, null),
                          ),
                          row.trust === 'user'
                            ? (
                              h('button', {
                                type: 'button',
                                class: `${css.iconButton} ${css.iconDanger}`,
                                'data-tip': t('delete'),
                                'aria-label': `${t('delete')}: ${text.name}`,
                                onclick: () => { props.confirmDelete(row.id) },
                              },
                                h(IconTrashOutline16, null),
                              )
                            )
                            : null,
                        ),
                        state.revealedPaths[row.id] === undefined
                          ? null
                          : (
                            h('p', {class: css.revealedPath ?? ''},
                              h('span', {class: css.revealedPathLabel ?? ''}, t('revealedPathLabel')),
                              h('code', null, state.revealedPaths[row.id]),
                            )
                          ),
                      )
                    )
                  }),
                )
              ),
              tail,
            )
          )
        }),
        h('span', {'data-copy-modal-slot': ''}),
        h('span', {'data-view-modal-slot': ''}),
        h('span', {'data-delete-modal-slot': ''}),
      )
    )
    applyDiff(this, vdom)

    for (const rowId of Array.from(this.#descriptionTooltips.keys())) {
      if (seenRowIds.has(rowId)) continue
      this.#descriptionTooltips.delete(rowId)
      this.#descriptionTruncated.delete(rowId)
      this.#descriptionResizeObservers.get(rowId)?.disconnect()
      this.#descriptionResizeObservers.delete(rowId)
    }

    for (const slot of Array.from(this.querySelectorAll('[data-desc-slot]'))) {
      const rowId = slot.getAttribute('data-desc-slot')
      if (rowId === null) continue
      const row = state.rows.find(candidate => candidate.id === rowId)
      if (row === undefined) continue
      const text = presetDisplayText(row, t).description ?? t('noDescription')
      slot.replaceWith(this.#renderDescription(rowId, text))
    }

    this.#renderCopyModal(state, t)
    this.#renderViewModal(state, t)
    this.#renderDeleteModal(state, t)
  }
}

defineElement('freddie-agent-preset-section', FreddieAgentPresetSection)

export function AgentPresetSection(props) {
  const el = document.createElement('freddie-agent-preset-section')
  el.setProps(props)
  return el
}
