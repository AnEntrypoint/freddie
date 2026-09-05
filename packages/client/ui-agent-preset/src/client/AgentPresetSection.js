/**
 * Agent-presets settings section: the roster as cards, a copy dialog as the
 * only way a preset is created, and a read-only viewer over the shipped
 * compositions.
 *
 * The browser edits no composition text — a shipped preset opens read-only to
 * be READ (it is the known-good composition a copy starts from), and a custom
 * preset is edited in its own files, which is what the location action leads
 * to. Deleting a preset leaves running sessions alone: a composition is
 * mounted once at session creation and nothing re-reads the file.
 *
 * Converted from a React hooks component to a webjsx custom element. The
 * `Modal`/`Tooltip` primitives are self-rendering custom elements, not plain
 * VNodes, so they are built once and retained (renderModal/renderTooltip),
 * then attached to the DOM directly rather than embedded in the `applyDiff`
 * vdom tree (Modal.tsx's and Tooltip.tsx's own doc: they are never diffed as
 * a child of the caller's own vdom).
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  Button, IconBrowseOutline16, IconCopyOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16,
  renderModal, renderTooltip,
} from '@freddie/freddie-client-ui-primitives'
import { draftBlocker } from './section-store.js'
import { presetDisplayText } from './locales.js'
import css from './AgentPresetSection.css.js'

/** Agent-presets settings section, as a custom element. */
export class FreddieAgentPresetSection extends HTMLElement {
  #props = null
  #loaded = false
  #copyModal = null
  #viewModal = null
  #deleteModal = null
  #descriptionTooltips = new Map()
  #descriptionTruncated = new Map()
  #descriptionResizeObservers = new Map()

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
  setProps(props) {
    this.#props = props
    if (!this.#loaded) {
      this.#loaded = true
      void props.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    for (const observer of this.#descriptionResizeObservers.values()) observer.disconnect()
    this.#descriptionResizeObservers.clear()
  }

  /**
   * Measure whether one card's clamped description is actually cut off, and
   * keep a ResizeObserver on it (the card width follows the settings pane,
   * which resizes with the window) — the webjsx replacement for the React
   * version's per-row `useLayoutEffect` + `useState`.
   * @param rowId - the preset row this description belongs to.
   * @param el - the measured description span, once mounted.
   */
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

  /**
   * Build (or update) the tooltip-wrapped description for one card, mounted
   * directly after its placeholder span (Tooltip is a self-rendering custom
   * element, not a plain VNode — see the module doc).
   * @param rowId - the preset row this description belongs to.
   * @param text - the description text, already localized.
   */
  #renderDescription(rowId, text) {
    const truncated = this.#descriptionTruncated.get(rowId) ?? false
    const existing = this.#descriptionTooltips.get(rowId) ?? null
    const tooltip = renderTooltip(existing, {
      // Capped near the card's own width: the default half-viewport bubble
      // would spill a description out of the settings dialog and across the
      // app behind it.
      label: text,
      side: 'bottom',
      delayMs: 400,
      disabled: !truncated,
      maxWidth: 360,
      children: (
        // The empty title stops the card body's native tooltip from climbing
        // to this span: a cut-off description answers with one bubble, not two.
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

    // A deployment that composes no presets has nothing to manage: every
    // session shares the host composition and the page would be an empty list.
    if (state.status === 'unavailable') {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }
    if (state.status === 'error') {
      /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
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

    /* The guided alternative to copying: the self-referential preset can
       read this very composition and author a new one in conversation.
       Offered only where that preset is actually on the roster and a
       session can be landed; without a writable root the draft could
       never be discovered, so the reason rides the disabled button. */
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
          // Same glyph as the Models page's add affordances.
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
          // The custom group is where a preset of one's own will appear, so it
          // stays on screen even while empty: heading plus the creator entry.
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
                        // The card body IS the control: picking a preset is the
                        // common act, so it should not hide behind a small button.
                        // The action row sits outside it — nesting buttons is
                        // invalid, and these act on the card rather than select it.
                        // A broken preset cannot compose a session, so its body is
                        // disabled and the card says why instead of offering it.
                        h('button', {
                          type: 'button',
                          class: css.cardMain ?? '',
                          'aria-pressed': String(row.isDefault),
                          disabled: row.isDefault || row.broken !== undefined,
                          // Without this the name is the whole card read aloud —
                          // title, badge, description, id.
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
                          // Shipped presets are the compositions a copy starts
                          // from, so READING one is the point; a custom preset is
                          // edited in its files instead, which the location action
                          // leads to. A broken shipped preset has no readable
                          // composition to offer, so its viewer is withheld; a
                          // broken custom one keeps the location action — the
                          // files are where it gets fixed.
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

    // Drop tooltip state for rows no longer on the roster.
    for (const rowId of Array.from(this.#descriptionTooltips.keys())) {
      if (seenRowIds.has(rowId)) continue
      this.#descriptionTooltips.delete(rowId)
      this.#descriptionTruncated.delete(rowId)
      this.#descriptionResizeObservers.get(rowId)?.disconnect()
      this.#descriptionResizeObservers.delete(rowId)
    }

    // Mount the tooltip-wrapped descriptions (self-rendering custom elements,
    // never diffed in as vdom children — see the module doc).
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-agent-preset-section') === undefined) {
  customElements.define('freddie-agent-preset-section', FreddieAgentPresetSection)
}

/**
 * Render the Agent presets section content column.
 * @param props - composed slot props.
 * @returns the section element.
 */
export function AgentPresetSection(props) {
  const el = document.createElement('freddie-agent-preset-section')
  el.setProps(props)
  return el
}
