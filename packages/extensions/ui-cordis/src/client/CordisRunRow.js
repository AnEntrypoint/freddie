/** `cordis_run` card and the host seat for Package-owned interactive UI.
 *
 * Converted from a React hooks component to a webjsx custom element: the
 * useEffect that called `onObserveRunCard` on identity/seq change becomes an
 * explicit dedupe check inside #render (Toast.tsx/JobListAction.tsx's
 * pattern of doing side effects synchronously in the render path with a
 * change guard, since there is no dependency-array primitive here).
 */

import { applyDiff, createElement as h } from 'webjsx'
import {
  IconCodeOutline16, IconInspectOutline12, StateDot,
} from '@freddie/freddie-client-ui-primitives'
import { cordisRunCard } from './card-model.js'
import { cordisToolViewKey } from './run-card-index.js'
import { cordisVisibleStatus } from './status.js'
import css from './CordisRunRow.css.js'

const READING_LABELS = {
  idle: 'status.idle',
  'awaiting-approval': 'status.awaitingApproval',
  failed: 'status.failed',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  removed: 'status.removed',
  superseded: 'status.superseded',
}

/** Render one activation result and, when eligible, its Package-owned view. */
export class FreddieCordisRunRow extends HTMLElement {
  #props = null
  #observed = null

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
    const {
      callId, block, inspect, renderSlot, useInventory, useLoaded, useRunCards, useActiveRuns,
      onObserveRunCard, t,
    } = props
    const card = cordisRunCard(block)
    const inventory = useInventory(snapshot => snapshot)
    const loaded = useLoaded(snapshot => snapshot)
    const latest = useRunCards(snapshot => snapshot)
    const activeRuns = useActiveRuns(snapshot => snapshot)
    const key = card.state === 'ok'
      && card.pluginId !== null
      && card.packageId !== null
      && card.pluginRunId !== null
      && card.seq !== null
      ? cordisToolViewKey(card.pluginId, card.packageId)
      : null

    if (key !== null && card.seq !== null && card.pluginRunId !== null) {
      const observationId = `${callId}:${card.pluginRunId}:${card.seq}`
      if (this.#observed !== observationId) {
        this.#observed = observationId
        onObserveRunCard({ key, callId, seq: card.seq, pluginRunId: card.pluginRunId })
      }
    }

    const row = card.pluginId === null
      ? undefined
      : inventory.rows.find(candidate => candidate.pluginId === card.pluginId)
    const pointer = key === null ? undefined : latest.get(key)
    const superseded = pointer !== undefined && pointer.callId !== callId && pointer.seq >= (card.seq ?? -1)
    const activity = card.pluginId === null ? undefined : activeRuns.get(card.pluginId)
    const attempt = card.pluginRunId !== null && row?.latestRun?.pluginRunId === card.pluginRunId
      ? row.latestRun
      : undefined
    const awaitingApproval = attempt?.status === 'awaiting-approval' || (card.packageId !== null
      && activity?.phase === 'awaiting-approval'
      && activity.packageId === card.packageId
      && (card.mode === null || activity.mode === card.mode))
    const reading = card.pluginId !== null && inventory.removed.has(card.pluginId)
      ? 'removed'
      : superseded
        ? 'superseded'
        : awaitingApproval
          ? 'awaiting-approval'
          : attempt?.status === 'failed'
            ? 'failed'
            : row !== undefined && card.packageId !== null
              ? cordisVisibleStatus(row, card.packageId, loaded)
              : 'idle'
    const status = t(READING_LABELS[reading])
    const summary = card.errorSummary
      ?? (card.pluginId === null ? callId : `${card.pluginId}${card.packageId === null ? '' : ` · ${card.packageId}`}`)
    const showBusiness = reading === 'running' && key !== null

    const vdom = (
      h('div',
        {
          class: css.card ?? '',
          'data-tool': 'cordis_run',
          'data-state': card.state,
          'data-cordis-plugin-id': card.pluginId ?? undefined,
          'data-cordis-package-id': card.packageId ?? undefined,
          'data-cordis-run-id': card.pluginRunId ?? undefined,
          'data-cordis-status': reading,
        },
        h('div', {class: css.row ?? ''},
          h('span', {class: css.icon ?? ''},
            card.state === 'error'
              ? h(StateDot, {state: 'error'})
              : card.state === 'stopped'
                ? h(StateDot, {state: 'warning'})
                : h(IconCodeOutline16, {size: 14}),
          ),
          h('span', {class: css.title ?? ''}, t(card.mode === 'update' ? 'row.updateTitle' : 'row.runTitle')),
          h('span', {class: css.separator ?? '', 'aria-hidden': ''}),
          h('span', {class: card.errorSummary === null ? (css.summary ?? '') : (css.error ?? '')}, summary),
          h('span', {class: css.status ?? ''}, status),
          inspect !== undefined && h('button', {type: 'button', class: css.inspect ?? '', 'aria-label': 'Inspect', onclick: inspect},
            h(IconInspectOutline12, null),
          ),
        ),
        reading === 'removed' && h('div', {class: css.message ?? ''}, t('run.removed')),
        reading === 'superseded' && h('div', {class: css.message ?? ''}, t('run.superseded')),
        reading === 'failed' && attempt?.error !== undefined && (
          h('div', {class: css.message ?? ''}, attempt.error.message)
        ),
        showBusiness && card.pluginId !== null && card.packageId !== null && card.pluginRunId !== null && (
          h('div', {class: css.business ?? '', 'data-cordis-business-view': key},
            renderSlot('tool.view.cordis', {
              pluginId: card.pluginId,
              packageId: card.packageId,
              pluginRunId: card.pluginRunId,
            }, {
              entryKey: key,
              fallback: card.output === null ? null : h('pre', {class: css.output ?? ''}, card.output),
            }),
          )
        ),
        !showBusiness && reading !== 'removed' && reading !== 'superseded' && card.output !== null && (
          h('pre', {class: css.output ?? ''}, card.output)
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-cordis-run-row') === undefined) {
  customElements.define('freddie-cordis-run-row', FreddieCordisRunRow)
}
