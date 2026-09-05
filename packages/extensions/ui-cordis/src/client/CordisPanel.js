/** Frame-wide dynamic Plugin inventory, approvals, versions, and lifecycle actions.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useState becomes a private instance field, useLayoutEffect/useEffect become
 * connectedCallback/disconnectedCallback-managed listeners driven from
 * #setOpen/#render, useDismissOnOutsidePointer becomes
 * createDismissOnOutsidePointer (JobListAction.tsx's pattern), and re-render
 * is an explicit applyDiff(this, vdom) call instead of implicit re-render on
 * setState. className -> class, camelCase event handlers -> lowercase, and
 * the inline `style={anchor}` object becomes a CSS string.
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  IconCheckOutline16, IconCloseOutline16, IconCordisPluginOutline14, IconPlayOutline16,
  IconStopFill16, IconTrashOutline16, Tooltip, createDismissOnOutsidePointer,
} from '@freddie/freddie-client-ui-primitives'
import { cordisVisibleStatus, packageOf } from './status.js'
import css from './CordisPanel.css.js'

const STATUS_LABELS = {
  idle: 'status.idle',
  'awaiting-approval': 'status.awaitingApproval',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  failed: 'status.failed',
}

const RENDER_FAILURE_LABELS = {
  abdicated: 'render.failedAbdicated',
  held: 'render.failedHeld',
}

function selectedPackageIdOf(
  { pluginId, listed, activity },
  selected,
) {
  const selectedPackageId = selected[pluginId]
  if (selectedPackageId !== undefined
    && listed?.packages.some(pkg => pkg.packageId === selectedPackageId)) return selectedPackageId
  return listed?.nextPackageId
    ?? listed?.currentPackageId
    ?? listed?.packages.at(-1)?.packageId
    ?? activity?.packageId
}

function visiblePanelStatus(
  view,
  selectedPackageId,
  loaded,
) {
  const { listed, activity } = view
  const latest = listed?.latestRun
  if (activity?.phase === 'awaiting-approval' || latest?.status === 'awaiting-approval') {
    return 'awaiting-approval'
  }
  if (latest?.status === 'failed' && latest.packageId === selectedPackageId) return 'failed'
  if (listed?.activeRun === undefined) return 'idle'
  return cordisVisibleStatus(listed, listed.activeRun.packageId, loaded)
}

function blockingFirst(rows) {
  return [
    ...rows.filter(row => row.activity?.phase === 'awaiting-approval'),
    ...rows.filter(row => row.activity?.phase !== 'awaiting-approval'),
  ]
}

function RowAction({ label, children, ...props }) {
  return (
    h(Tooltip, {label: label, side: 'bottom', delayMs: 500},
      h('button', {type: 'button', class: css.actionButton ?? '', 'aria-label': label, ...props},
        children,
      ),
    )
  )
}

function DoubleCheckIcon() {
  return (
    h('span', {class: css.doubleCheck ?? '', 'aria-hidden': ''},
      h(IconCheckOutline16, {size: 12}),
      h(IconCheckOutline16, {size: 12}),
    )
  )
}

/** Frame-wide dynamic Plugin inventory panel, as a webjsx custom element. */
export class FreddieCordisPanel extends HTMLElement {
  #props = null
  #open = false
  #selected = {}
  #pending = new Set()
  #actionErrors = new Map()
  #visibleRequests = new Set()
  #anchor
  #resizeHandler = null
  #dismiss = createDismissOnOutsidePointer({ root: this, onDismiss: () => { this.#setOpen(false) } })

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    const first = this.#props === null
    this.#props = props
    this.#syncActiveRuns()
    this.#render()
    if (first) props.onRefresh()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#dismiss.stop()
    this.#unbindResize()
  }

  #setOpen(open) {
    if (this.#open === open) return
    this.#open = open
    if (open) {
      this.#dismiss.start()
      this.#bindResize()
      this.#props?.onRefresh()
    } else {
      this.#dismiss.stop()
      this.#unbindResize()
    }
    this.#render()
  }

  #placeAnchor() {
    const rect = this.getBoundingClientRect()
    this.#anchor = { left: rect.left, bottom: window.innerHeight - rect.top + 8 }
  }

  #bindResize() {
    this.#unbindResize()
    this.#placeAnchor()
    const place = () => {
      this.#placeAnchor()
      this.#render()
    }
    this.#resizeHandler = place
    window.addEventListener('resize', place)
  }

  #unbindResize() {
    if (this.#resizeHandler === null) return
    window.removeEventListener('resize', this.#resizeHandler)
    this.#resizeHandler = null
  }

  /** Auto-open the panel when a new approval request appears. */
  #syncActiveRuns() {
    const props = this.#props
    if (props === null) return
    const activeRuns = props.useActiveRuns(snapshot => snapshot)
    const now = new Set()
    for (const activity of activeRuns.values()) {
      if (activity.phase === 'awaiting-approval') now.add(activity.requestId)
    }
    const discovered = [...now].some(requestId => !this.#visibleRequests.has(requestId))
    this.#visibleRequests = now
    if (discovered) this.#setOpen(true)
  }

  #runAction(pluginId, action) {
    if (this.#pending.has(pluginId)) return
    this.#pending = new Set(this.#pending).add(pluginId)
    const clearedErrors = new Map(this.#actionErrors)
    clearedErrors.delete(pluginId)
    this.#actionErrors = clearedErrors
    this.#render()
    void (async () => {
      try {
        const result = await action()
        if (result !== undefined && !result.ok) {
          this.#actionErrors = new Map(this.#actionErrors).set(pluginId, result.message ?? 'operation failed')
        }
      } catch (error) {
        this.#actionErrors = new Map(this.#actionErrors).set(
          pluginId,
          error instanceof Error ? error.message : String(error),
        )
      } finally {
        const next = new Set(this.#pending)
        next.delete(pluginId)
        this.#pending = next
        this.#props?.onRefresh()
        this.#render()
      }
    })()
  }

  #renderRow(view) {
    const props = this.#props
    if (props === null) return h(Fragment, null)
    const { t, useLoaded, onApprove, onDecline, onRun, onStop, onRemove } = props
    const loaded = useLoaded(snapshot => snapshot)
    const { pluginId, listed, activity } = view
    const selectedPackageId = selectedPackageIdOf(view, this.#selected)
    const selectedPackage = listed !== undefined && selectedPackageId !== undefined
      ? packageOf(listed, selectedPackageId)
      : undefined
    const activePackage = listed?.activeRun === undefined
      ? undefined
      : packageOf(listed, listed.activeRun.packageId)
    const name = selectedPackage?.name
      ?? (activity?.phase === 'awaiting-approval' ? activity.name : pluginId)
    const purpose = selectedPackage?.purpose
      ?? (activity?.phase === 'awaiting-approval' ? activity.purpose : '')
    const latest = listed?.latestRun
    const awaiting = activity?.phase === 'awaiting-approval'
      ? activity.requestId
      : latest?.status === 'awaiting-approval' ? latest.approvalRequestId : undefined
    const status = visiblePanelStatus(view, selectedPackageId, loaded)
    const busy = this.#pending.has(pluginId) || activity?.phase === 'orchestrating'
    const failure = props.useRunErrors(snapshot => snapshot).get(pluginId)
    const hostFailure = latest?.status === 'failed' ? latest.error : undefined
    const renderFailure = props.useRenderFailures(snapshot => snapshot).get(pluginId)
    const actionError = this.#actionErrors.get(pluginId)
    const nextPackageId = listed?.nextPackageId !== undefined
      && listed.nextPackageId !== listed.currentPackageId ? listed.nextPackageId : undefined
    const currentPackageId = listed?.currentPackageId
    const runMode = listed?.currentPackageId !== undefined
      && selectedPackageId !== listed.currentPackageId ? 'update' : 'run'

    return (
      h('li',
        {
          key: pluginId,
          class: css.row ?? '',
          'data-cordis-row': pluginId,
          'data-cordis-status': status,
          'data-cordis-awaiting': awaiting !== undefined || undefined,
        },
        h('div', {class: css.rowHead ?? ''},
          h('span', {class: css.rowId ?? ''}, pluginId),
          h('span', {class: css.rowName ?? ''}, name),
          h('span', {class: css.rowStatus ?? ''}, t(STATUS_LABELS[status])),
        ),
        listed !== undefined && listed.packages.length > 1 && selectedPackageId !== undefined && (
          h('label', {class: css.versionPicker ?? ''},
            h('span', null, t('panel.version')),
            h('select',
              {
                value: selectedPackageId,
                disabled: busy,
                onchange: (event) => {
                  const value = event.target.value
                  this.#selected = { ...this.#selected, [pluginId]: value }
                  this.#render()
                },
              },
              listed.packages.map(pkg => (
                h('option', {key: pkg.packageId, value: pkg.packageId}, `${pkg.name} · ${pkg.packageId}`)
              )),
            ),
          )
        ),
        h('div', {class: css.rowDetail ?? ''},
          h('span', {class: css.rowPurpose ?? ''}, purpose),
          h('div', {class: css.rowActions ?? ''},
            awaiting !== undefined && (
              h(Fragment, null,
                h(RowAction,
                  {
                    label: t('action.approveOnce'),
                    'data-cordis-approve': awaiting,
                    disabled: busy,
                    onclick: () => { this.#runAction(pluginId, async () => {
                      await onApprove(awaiting, false)
                      this.#setOpen(false)
                    }) },
                  },
                  h(IconCheckOutline16, {size: 14}),
                ),
                h(RowAction,
                  {
                    label: t('action.approvePlugin'),
                    'data-cordis-approve-plugin': awaiting,
                    disabled: busy,
                    onclick: () => { this.#runAction(pluginId, async () => {
                      await onApprove(awaiting, true)
                      this.#setOpen(false)
                    }) },
                  },
                  h(DoubleCheckIcon, null),
                ),
                h(RowAction,
                  {
                    label: t('action.decline'),
                    'data-cordis-decline': awaiting,
                    disabled: busy,
                    onclick: () => { this.#runAction(pluginId, async () => {
                      await onDecline(awaiting)
                      this.#setOpen(false)
                    }) },
                  },
                  h(IconCloseOutline16, {size: 14}),
                ),
              )
            ),
            awaiting === undefined && listed !== undefined
              && selectedPackageId !== undefined && listed.activeRun === undefined && (
              h(RowAction,
                {
                  label: t('action.run'),
                  'data-cordis-switch': 'run',
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onRun({
                    agentId: listed.agentId,
                    pluginId,
                    packageId: selectedPackageId,
                    mode: runMode,
                    hasClientHalf: selectedPackage?.hasClientHalf === true,
                  })) },
                },
                h(IconPlayOutline16, {size: 14}),
              )
            ),
            awaiting === undefined && listed !== undefined && listed.activeRun !== undefined
              && selectedPackageId !== listed.activeRun.packageId && selectedPackage !== undefined && (
              h(RowAction,
                {
                  label: t('action.run'),
                  'data-cordis-switch': 'run',
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onRun({
                    agentId: listed.agentId,
                    pluginId,
                    packageId: selectedPackage.packageId,
                    mode: runMode,
                    hasClientHalf: selectedPackage.hasClientHalf,
                  })) },
                },
                h(IconPlayOutline16, {size: 14}),
              )
            ),
            awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && status === 'client-pending'
              && activePackage !== undefined && selectedPackageId === listed.activeRun.packageId && (
              h(RowAction,
                {
                  label: t('action.run'),
                  'data-cordis-switch': 'run',
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onRun({
                    agentId: listed.agentId,
                    pluginId,
                    packageId: activePackage.packageId,
                    mode: 'run',
                    hasClientHalf: true,
                  })) },
                },
                h(IconPlayOutline16, {size: 14}),
              )
            ),
            awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && (
              h(RowAction,
                {
                  label: t('action.stop'),
                  'data-cordis-switch': 'stop',
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onStop(listed.agentId, pluginId)) },
                },
                h(IconStopFill16, {size: 14}),
              )
            ),
            awaiting === undefined && listed !== undefined && (
              h(RowAction,
                {
                  label: t('action.remove'),
                  'data-cordis-remove': pluginId,
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onRemove(listed.agentId, pluginId)) },
                },
                h(IconTrashOutline16, {size: 14}),
              )
            ),
          ),
        ),
        awaiting === undefined && nextPackageId !== undefined && listed !== undefined && (
          h('div', {class: css.transition ?? ''},
            h('span', null, currentPackageId === undefined ? '' : t('panel.current', { packageId: currentPackageId })),
            h('span', null, t('panel.next', { packageId: nextPackageId })),
            h('div', {class: css.transitionActions ?? ''},
              h('button',
                {
                  type: 'button',
                  disabled: busy,
                  onclick: () => { this.#runAction(pluginId, () => onRun({
                    agentId: listed.agentId,
                    pluginId,
                    packageId: nextPackageId,
                    mode: currentPackageId === undefined ? 'run' : 'update',
                    hasClientHalf: packageOf(listed, nextPackageId)?.hasClientHalf === true,
                  })) },
                },
                t('action.retry'),
              ),
              currentPackageId !== undefined && (
                h('button',
                  {
                    type: 'button',
                    disabled: busy,
                    onclick: () => { this.#runAction(pluginId, () => onRun({
                      agentId: listed.agentId,
                      pluginId,
                      packageId: currentPackageId,
                      mode: 'run',
                      hasClientHalf: packageOf(listed, currentPackageId)?.hasClientHalf === true,
                    })) },
                  },
                  t('action.rollback'),
                )
              ),
            ),
          )
        ),
        failure !== undefined && (
          h('div', {class: css.rowError ?? '', role: 'alert'}, `${failure.message} (${failure.reason})`)
        ),
        failure === undefined && hostFailure !== undefined && (
          h('div', {class: css.rowError ?? '', role: 'alert'}, `${hostFailure.message} (${hostFailure.phase})`)
        ),
        actionError !== undefined && h('div', {class: css.rowError ?? '', role: 'alert'}, actionError),
        renderFailure !== undefined && (
          h('div',
            {
              class: css.rowError ?? '',
              role: 'alert',
              'data-cordis-render-failure': renderFailure.slot,
              'data-cordis-render-abdicated': renderFailure.abdicated || undefined,
            },
            `${t(RENDER_FAILURE_LABELS[renderFailure.abdicated ? 'abdicated' : 'held'], {
              slot: renderFailure.slot,
            })} ${renderFailure.message}`,
          )
        ),
        activePackage !== undefined && activePackage.packageId !== selectedPackageId && (
          h('span', {class: css.activeVersion ?? ''}, `${t('status.running')}: ${activePackage.name} · ${activePackage.packageId}`)
        ),
      )
    )
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, h('span', {style: 'display:none'})); return }
    const { wide, useSessions, useInventory, useActiveRuns, useLoaded, t } = props

    const inventory = useInventory(snapshot => snapshot)
    const activeRuns = useActiveRuns(snapshot => snapshot)
    const loaded = useLoaded(snapshot => snapshot)
    const current = useSessions(state => state.current)

    const byPlugin = new Map()
    for (const listed of inventory.rows) {
      const activity = activeRuns.get(listed.pluginId)
      byPlugin.set(listed.pluginId, {
        pluginId: listed.pluginId,
        agentId: activity?.agentId ?? listed.agentId,
        listed,
        ...activity === undefined ? {} : { activity },
      })
    }
    for (const [pluginId, activity] of activeRuns) {
      if (byPlugin.has(pluginId)) continue
      byPlugin.set(pluginId, { pluginId, agentId: activity.agentId, activity })
    }
    const all = [...byPlugin.values()]
    const mine = blockingFirst(all.filter(row => current !== undefined && row.agentId === current))
    const theirs = blockingFirst(all.filter(row => current === undefined || row.agentId !== current))
    const approvals = [...activeRuns.values()].filter(activity => activity.phase === 'awaiting-approval').length
    const running = all.filter(view => visiblePanelStatus(
      view,
      selectedPackageIdOf(view, this.#selected),
      loaded,
    ) === 'running').length

    if (all.length === 0) { applyDiff(this, h('span', {style: 'display:none'})); return }

    const open = this.#open
    const anchor = this.#anchor

    const vdom = (
      h('div', {class: wide ? (css.layer ?? '') : `${css.layer ?? ''} ${css.rail ?? ''}`},
        open && anchor !== undefined && (
          h('section',
            {
              class: css.panel ?? '',
              style: `left: ${anchor.left}px; bottom: ${anchor.bottom}px`,
              'data-cordis-panel': '',
              'aria-label': t('panel.title'),
            },
            h('header', {class: css.header ?? ''},
              h('span', {class: css.title ?? ''}, t('panel.title')),
            ),
            h('div', {class: css.body ?? ''},
              inventory.error !== undefined && (
                h('p', {class: css.readError ?? '', role: 'alert'}, t('panel.readFailed', { message: inventory.error }))
              ),
              !inventory.read && inventory.error === undefined && h('p', {class: css.note ?? ''}, t('panel.loading')),
              inventory.read && all.length === 0 && h('p', {class: css.note ?? ''}, t('panel.empty')),
              mine.length > 0 && (
                h('section', null,
                  h('h3', {class: css.group ?? ''}, t('panel.group.current')),
                  h('ul', {class: css.rows ?? ''}, mine.map(view => this.#renderRow(view))),
                )
              ),
              theirs.length > 0 && (
                h('section', null,
                  h('h3', {class: css.group ?? ''}, t('panel.group.others')),
                  h('ul', {class: css.rows ?? ''}, theirs.map(view => this.#renderRow(view))),
                )
              ),
            ),
          )
        ),
        h('div', {class: css.footerButtons ?? ''},
          h('button',
            {
              type: 'button',
              class: css.badge ?? '',
              'data-cordis-badge': all.length,
              'data-cordis-approval-badge': approvals,
              'data-active': approvals > 0 || undefined,
              'aria-label': t('panel.plugins.aria'),
              'aria-expanded': open,
              onclick: () => { this.#setOpen(!open) },
            },
            h(IconCordisPluginOutline14, {size: wide ? 16 : 18}),
            wide && (
              h(Fragment, null,
                h('span', {class: css.badgeLabel ?? ''}, t('panel.trigger')),
                h('span', {class: css.badgeCount ?? ''}, t('panel.runningCount', { count: running })),
              )
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-cordis-panel') === undefined) {
  customElements.define('freddie-cordis-panel', FreddieCordisPanel)
}
