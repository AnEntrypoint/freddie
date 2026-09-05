/** Read-only `cordis_define` card with Host and Client source tabs.
 *
 * Converted from a React hooks component (useState/useId) to a plain webjsx
 * function component: this card has no lifecycle needs (no effects, no
 * external subscriptions beyond the injected hooks already re-invoked on
 * every parent re-render), so local `expanded`/`selectedSource` state is
 * hoisted into module-scope WeakMap-keyed state per callId instead of a
 * custom element — matching the "stateless-looking, state-carrying" plain
 * function idiom used elsewhere for simple per-key toggles. useId becomes a
 * stable id derived from callId.
 */

import {
  CodeBlock, DisclosureRow, IconCodeOutline16, IconInspectOutline12, StateDot,
} from '@freddie/freddie-client-ui-primitives'
import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { cordisDefineCard } from './card-model.js'
import { cordisVisibleStatus } from './status.js'
import css from './CordisDefineRow.css.js'

const READING_LABELS = {
  idle: 'status.idle',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  removed: 'status.removed',
}

function stateStatus(state) {
  switch (state) {
    case 'running': return 'a11y.defining'
    case 'error': return 'a11y.failed'
    case 'stopped': return 'a11y.stopped'
    default: return null
  }
}

function leadingFor(state) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return h(IconCodeOutline16, {size: 14})
  }
}

/** Per-card local UI state (expanded / active source tab), keyed by `callId`. */
const cardStates = new Map()

function stateFor(callId) {
  let state = cardStates.get(callId)
  if (state === undefined) {
    state = { expanded: false, selectedSource: null }
    cardStates.set(callId, state)
  }
  return state
}

/** Read-only `cordis_define` card, as a webjsx custom element (per-instance re-render on toggle). */
export class FreddieCordisDefineRow extends HTMLElement {
  #props = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, h('span', {style: 'display:none'})); return }
    const { callId, block, inspect, useInventory, useLoaded, t } = props
    const card = cordisDefineCard(block)
    const inventory = useInventory(snapshot => snapshot)
    const loaded = useLoaded(snapshot => snapshot)
    const defaultSource = card.clientCode !== null ? 'client' : 'host'
    const local = stateFor(callId)
    const sourcePanelId = `cordis-define-${callId}`

    const row = card.pluginId === null
      ? undefined
      : inventory.rows.find(candidate => candidate.pluginId === card.pluginId)
    const reading = card.pluginId !== null && inventory.removed.has(card.pluginId)
      ? 'removed'
      : row !== undefined && card.packageId !== null
        ? cordisVisibleStatus(row, card.packageId, loaded)
        : 'idle'
    const name = card.name ?? callId
    const expandable = card.hostCode !== null || card.clientCode !== null || card.output !== null
    const open = local.expanded && expandable
    const a11yState = stateStatus(card.state)
    const hasSource = card.clientCode !== null || card.hostCode !== null
    const selectedSource = local.selectedSource ?? defaultSource
    const activeSource = selectedSource === 'client' && card.clientCode !== null
      ? 'client'
      : selectedSource === 'host' && card.hostCode !== null
        ? 'host'
        : card.clientCode !== null ? 'client' : 'host'
    const activeCode = activeSource === 'client' ? card.clientCode : card.hostCode

    const vdom = (
      h('div',
        {
          class: css.card ?? '',
          'data-tool': 'cordis_define',
          'data-state': card.state,
          'data-terminal': reading === 'removed' || undefined,
          'data-cordis-plugin-id': card.pluginId ?? undefined,
          'data-cordis-package-id': card.packageId ?? undefined,
          'data-cordis-status': reading,
        },
        a11yState !== null && h('span', {class: css.visuallyHidden ?? ''}, t(a11yState)),
        h(DisclosureRow,
          {
            rowClassName: css.row,
            titleClassName: css.title,
            chevronClassName: css.chevron,
            icon: leadingFor(card.state),
            title: t('row.defineTitle'),
            open: open,
            expandable: expandable,
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: () => { local.expanded = !local.expanded; this.#render() },
            collapsedContent: (
              h(Fragment, null,
                h('span', {class: css.separator ?? '', 'aria-hidden': ''}),
                h('span', {class: card.errorSummary === null ? (css.name ?? '') : (css.errorSummary ?? '')},
                  card.errorSummary ?? name,
                ),
                card.errorSummary === null && (
                  h('span', {class: css.purpose ?? ''}, card.purpose ?? t('purpose.missing'))
                ),
                card.pluginId !== null && (
                  h('span', {class: css.readout ?? ''},
                    h('span', {class: css.statusLabel ?? ''}, t(READING_LABELS[reading])),
                  )
                ),
              )
            ),
          },
          h('div', {class: css.bodyWrap ?? ''},
            hasSource && activeCode !== null && (
              h('section', {class: css.sourceCard ?? ''},
                h('div', {class: css.sourceTabs ?? '', role: 'tablist', 'aria-label': t('body.source')},
                  ['client', 'host'].map((source) => {
                    const available = source === 'client' ? card.clientCode !== null : card.hostCode !== null
                    return (
                      h('button',
                        {
                          key: source,
                          id: `${sourcePanelId}-${source}`,
                          type: 'button',
                          role: 'tab',
                          'aria-controls': sourcePanelId,
                          'aria-selected': activeSource === source,
                          class: activeSource === source ? `${css.sourceTab ?? ''} ${css.sourceTabActive ?? ''}` : (css.sourceTab ?? ''),
                          disabled: !available,
                          onclick: () => { local.selectedSource = source; this.#render() },
                        },
                        t(source === 'client' ? 'body.clientCode' : 'body.hostCode'),
                      )
                    )
                  }),
                ),
                h('div',
                  {
                    id: sourcePanelId,
                    class: css.sourcePanel ?? '',
                    role: 'tabpanel',
                    'aria-labelledby': `${sourcePanelId}-${activeSource}`,
                  },
                  h(CodeBlock, {
                    code: activeCode,
                    lang: 'javascript',
                    copyLabel: t('body.copy'),
                    copiedLabel: t('body.copied'),
                    class: css.sourceCode,
                  }),
                ),
              )
            ),
            card.output !== null && (
              h('section', {class: css.codeSection ?? ''},
                h('div', {class: css.sectionLabel ?? ''}, t('body.output')),
                h('pre', {class: css.output ?? '', 'data-error': card.state === 'error' || undefined}, card.output),
              )
            ),
            card.pluginId !== null && h('div', {class: css.panelHint ?? ''}, t('panel.hint')),
            inspect !== undefined && (
              h('button', {type: 'button', class: css.inspectButton ?? '', onclick: inspect},
                h(IconInspectOutline12, null),
                'Inspect',
              )
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-cordis-define-row') === undefined) {
  customElements.define('freddie-cordis-define-row', FreddieCordisDefineRow)
}
