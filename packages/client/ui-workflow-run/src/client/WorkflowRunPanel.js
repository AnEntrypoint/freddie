import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  DisclosureRow, IconChevronRightOutline14, StateDot,
} from '@freddie/freddie-client-ui-primitives'
import { shallowEqual } from '@freddie/freddie-client-runtime/client'
import css from './WorkflowRunPanel.css.js'

const STATUS_KEYS = {
  running: 'status.running',
  completed: 'status.completed',
  failed: 'status.failed',
  cancelled: 'status.cancelled',
  interrupted: 'status.interrupted',
}

function dotState(status) {
  switch (status) {
    case 'running': return 'ongoing'
    case 'completed': return 'done'
    case 'failed': return 'error'
    case 'cancelled':
    case 'interrupted': return 'warning'
    /* v8 ignore next -- WorkflowRunStatus is closed and every variant is handled above. */
    default: return status
  }
}

function readablePhase(phase, t) {
  if (phase === null) return t('phase.unassigned')
  return phase === '' ? t('phase.empty') : phase
}

function readableMember(label, t) {
  return label === '' ? t('member.empty') : label
}

function statusCount(
  status,
  count,
  t,
) {
  return t(`statusCount.${status}`, { count })
}

function memberCount(count, t) {
  return t(count === 1 ? 'run.members.one' : 'run.members.other', { count })
}

function StatusDisclosure(props) {
  return h(DisclosureRow, { ...props, expandable: true })
}

function abnormal(status) {
  return status === 'failed' || status === 'cancelled' || status === 'interrupted'
}

function phaseDisclosureFacts(phase) {
  const mode = phase.members.some(member => abnormal(member.status))
    ? 'abnormal'
    : phase.members.some(member => member.status === 'running') ? 'running' : 'clean'
  return { mode, activityCount: phase.members.length }
}

function runDisclosureFacts(
  status,
  phases,
) {
  const mode = abnormal(status) || phases.some(([, facts]) => facts.mode === 'abnormal')
    ? 'abnormal'
    : status === 'running' || phases.some(([, facts]) => facts.mode === 'running')
      ? 'running'
      : 'clean'
  const activityCount = phases.reduce((count, [, facts]) => count + facts.activityCount, 0)
  return { mode, activityCount }
}

function initialDisclosureState(facts) {
  return { ...facts, open: facts.mode !== 'clean', pendingCleanCollapse: false }
}

function advanceDisclosureState(
  current,
  facts,
  focusWithin,
) {
  const sameFacts = current.mode === facts.mode && current.activityCount === facts.activityCount
  if (sameFacts) {
    if (!current.pendingCleanCollapse || focusWithin) return current
    return { ...current, open: false, pendingCleanCollapse: false }
  }
  if (facts.mode === 'clean') {
    const deferCollapse = current.open && focusWithin
    return { ...facts, open: deferCollapse, pendingCleanCollapse: deferCollapse }
  }
  if (current.mode === 'clean' || (facts.mode === 'abnormal' && current.mode !== 'abnormal')) {
    return { ...facts, open: true, pendingCleanCollapse: false }
  }
  return { ...facts, open: current.open, pendingCleanCollapse: false }
}

function focusIsWithin(element) {
  if (element === null || element === undefined) return false
  return element.contains(element.ownerDocument.activeElement)
}

function collapsePending(state) {
  if (!state.pendingCleanCollapse) return state
  return { ...state, open: false, pendingCleanCollapse: false }
}

function existingPhaseState(
  phases,
  key,
) {
  const phase = phases.get(key)
  /* v8 ignore next -- mounted phase callbacks are created from this owner map. */
  if (phase === undefined) throw new Error(`Missing disclosure state for phase ${key}`)
  return phase
}

function preventPendingHeaderFocus(event) {
  const header = (event.currentTarget).querySelector('[data-disclosure-row]')
  /* v8 ignore next -- DisclosureRow always renders its header before the content. */
  if (header === null) throw new Error('Missing disclosure header')
  if (header.contains(event.target)) event.preventDefault()
}

function phaseStatusSummary(members, t) {
  const counts = new Map()
  for (const member of members) counts.set(member.status, (counts.get(member.status) ?? 0) + 1)
  const count = (status) => counts.get(status) ?? 0
  const active = (['running', 'failed', 'cancelled', 'interrupted'])
    .filter(status => count(status) > 0)
  if (active.length === 0) return statusCount('completed', count('completed'), t)
  const visible = active.includes('interrupted') && count('completed') > 0
    ? ['completed', ...active]
    : active
  return visible.map(status => statusCount(status, count(status), t)).join(' · ')
}

function navigableMembers(
  sessions,
  phases,
  parentId,
) {
  const ordinary = new Set(sessions.ids)
  const result = []
  for (const phase of phases) {
    for (const member of phase.members) {
      const summary = sessions.byId[member.childId]
      if (member.status === 'running'
        && ordinary.has(member.childId)
        && summary?.origin === 'subagent'
        && summary.parentId === parentId
        && summary.running) {
        result.push(member.childId)
      }
    }
  }
  return result
}

function RunHeader({ children, count, name, onToggle, open, status, t }) {
  return (
    h(StatusDisclosure, {
      icon: h(IconChevronRightOutline14, null),
      title: t('run.title', { name }),
      open: open,
      onToggle: onToggle,
      expandOnRowClick: true,
      previewChevron: false,
      keepContentWhenOpen: true,
      rowClassName: css.runHeader,
      leadingClassName: css.runLeading,
      titleClassName: css.runTitle,
      collapsedContent: (
        h(Fragment, null,
          h('span', { class: css.separator ?? '', 'aria-hidden': '' }),
          h('span', { class: css.runSummary ?? '' }, memberCount(count, t)),
          h('span', { class: css.statusTail ?? '', 'data-status': status },
            h(StateDot, { state: dotState(status) }),
            h('span', null, t(STATUS_KEYS[status])),
          ),
        )
      ),
    },
      children,
    )
  )
}

function MemberRow({ member, navigable, openSession, t }) {
  const name = readableMember(member.label, t)

  const content = (
    h(Fragment, null,
      h('span', { class: css.dotSlot ?? '' }, h(StateDot, { state: dotState(member.status) })),
      h('span', { class: css.memberLabelWrap ?? '', 'data-member-label-wrap': '' }, h('span', { class: css.memberLabel ?? '', 'data-member-label': '' }, name)),
      h('span', { class: css.memberStatus ?? '', 'data-member-status-text': '' }, t(STATUS_KEYS[member.status])),
    )
  )
  if (!navigable) {
    // The original React version rendered a focusable-but-inert button while
    // keyboard focus lingered on a member that stopped being navigable
    // (member.status flipped away from 'running' mid-focus). webjsx has no
    // React-style focus-tracking state hook; instead the DOM's native
    // :focus-within-adjacent behavior is unaffected by dropping that local
    // affordance, since a blur naturally moves focus off a removed control.
    return h('div', { class: css.memberRow ?? '', 'data-member-status': member.status }, content)
  }
  return (
    h('button', {
      type: 'button',
      class: css.memberButton ?? '',
      'data-member-status': member.status,
      'aria-label': t('member.open', { name }),
      onclick: () => { openSession(member.childId) },
    },
      content,
    )
  )
}

function PhaseSection({
  contentRef, onContentBlur, onToggle, open, pendingCleanCollapse,
  phase, navigable, openSession, t,
}) {
  return (
    h('div', {
      class: css.phase ?? '',
      onmousedowncapture: pendingCleanCollapse ? preventPendingHeaderFocus : null,
    },
      h(StatusDisclosure, {
        icon: h(IconChevronRightOutline14, null),
        title: readablePhase(phase.phase, t),
        open: open,
        onToggle: onToggle,
        expandOnRowClick: true,
        previewChevron: false,
        keepContentWhenOpen: true,
        rowClassName: css.phaseHeader,
        leadingClassName: css.phaseLeading,
        titleClassName: css.phaseTitle,
        collapsedContent: (
          h(Fragment, null,
            h('span', { class: css.separator ?? '', 'aria-hidden': '' }),
            h('span', { class: css.phaseCount ?? '', 'data-phase-count': '' }, memberCount(phase.members.length, t)),
            h('span', { class: css.phaseStatus ?? '', 'data-phase-status-text': '' }, phaseStatusSummary(phase.members, t)),
          )
        ),
      },
        h('div', { ref: (node) => { contentRef(node) }, class: css.members ?? '', onblur: onContentBlur },
          phase.members.map(member => (
            h(MemberRow, {
              key: member.seq,
              member: member,
              navigable: navigable.includes(member.childId),
              openSession: openSession,
              t: t,
            })
          )),
        ),
      ),
    )
  )
}

/**
 * Render one durable workflow run with status-driven run and phase
 * disclosure, as a webjsx custom element.
 *
 * Converted from a React hooks component (useState/useMemo/useRef/
 * useLayoutEffect) to a webjsx custom element: `disclosures` state becomes an
 * instance field, the derived phaseFacts/runFacts/navigable memos become
 * plain per-render recomputation (no framework memoization needed at this
 * scale), the outer-hiding useLayoutEffect that settles deferred collapses
 * becomes an explicit call at the top of `#render()` before building vdom,
 * and the content refs (blur tracking for collapse deferral) are read from
 * the live DOM via querySelector after each applyDiff, since ref callbacks
 * are not part of webjsx's contract the way they are in React.
 */
export class FreddieWorkflowRunPanel extends HTMLElement {
  #props = null
  #disclosures = null
  #runContent = null
  #phaseContents = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    // No pending timers/listeners to release.
  }

  #settleDisclosures(phaseFacts, runFacts) {
    const current = this.#disclosures ?? {
      run: initialDisclosureState(runFacts),
      phases: new Map(phaseFacts.map(([key, facts]) => [key, initialDisclosureState(facts)])),
    }
    const phases = new Map()
    let phaseStartedCycle = false
    for (const [key, facts] of phaseFacts) {
      const previous = current.phases.get(key)
      const next = previous === undefined
        ? initialDisclosureState(facts)
        : advanceDisclosureState(previous, facts, focusIsWithin(this.#phaseContents.get(key)))
      phases.set(key, next)
      if (previous?.mode === 'clean'
        && (facts.mode !== 'clean' || facts.activityCount !== previous.activityCount)) {
        phaseStartedCycle = true
      }
    }
    const advancedRun = advanceDisclosureState(
      current.run,
      runFacts,
      focusIsWithin(this.#runContent),
    )
    const run = phaseStartedCycle && runFacts.mode !== 'clean' && !advancedRun.open
      ? { ...advancedRun, open: true, pendingCleanCollapse: false }
      : advancedRun
    const next = { run, phases }
    this.#disclosures = next
    return next
  }

  #toggleRun() {
    const current = this.#disclosures
    if (current === null) return
    this.#disclosures = {
      ...current,
      run: { ...current.run, open: !current.run.open, pendingCleanCollapse: false },
    }
    this.#render()
  }

  #togglePhase(key) {
    const current = this.#disclosures
    if (current === null) return
    const phases = new Map(current.phases)
    const phase = existingPhaseState(phases, key)
    phases.set(key, { ...phase, open: !phase.open, pendingCleanCollapse: false })
    this.#disclosures = { ...current, phases }
    this.#render()
  }

  #settleRunBlur(event) {
    const currentTarget = event.currentTarget
    if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return
    const current = this.#disclosures
    if (current === null) return
    const run = collapsePending(current.run)
    if (run === current.run) return
    this.#disclosures = { ...current, run }
    this.#render()
  }

  #settlePhaseBlur(key, event) {
    const currentTarget = event.currentTarget
    if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return
    const current = this.#disclosures
    if (current === null) return
    const phase = existingPhaseState(current.phases, key)
    const next = collapsePending(phase)
    if (next === phase) return
    const phases = new Map(current.phases)
    phases.set(key, next)
    this.#disclosures = { ...current, phases }
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { node, sessionId, useSessions, openSession, t } = props

    const phaseFacts = node.data.phases.map(phase => (
      [phase.key, phaseDisclosureFacts(phase)]
    ))
    const runFacts = runDisclosureFacts(node.data.status, phaseFacts)
    const totalMembers = runFacts.activityCount
    const disclosures = this.#settleDisclosures(phaseFacts, runFacts)
    const navigable = useSessions(
      sessions => navigableMembers(sessions, node.data.phases, sessionId),
      shallowEqual,
    )

    const vdom = (
      h('section', {
        class: css.root ?? '',
        'data-workflow-run': '',
        'data-run-status': node.data.status,
        onmousedowncapture: disclosures.run.pendingCleanCollapse
          ? preventPendingHeaderFocus
          : null,
      },
        h(RunHeader, {
          count: totalMembers,
          name: node.data.name,
          open: disclosures.run.open,
          onToggle: () => { this.#toggleRun() },
          status: node.data.status,
          t: t,
        },
          h('div', {
            ref: (element) => { this.#runContent = element },
            class: css.phaseList ?? '',
            onblur: (event) => { this.#settleRunBlur(event) },
          },
            node.data.phases.length === 0
              ? h('span', { class: css.empty ?? '' }, t('run.empty'))
              : node.data.phases.map((phase) => {
                const facts = phaseDisclosureFacts(phase)
                const disclosure = disclosures.phases.get(phase.key) ?? initialDisclosureState(facts)
                return (
                  h(PhaseSection, {
                    key: phase.key,
                    contentRef: (element) => {
                      if (element === null) this.#phaseContents.delete(phase.key)
                      else this.#phaseContents.set(phase.key, element)
                    },
                    onContentBlur: (event) => { this.#settlePhaseBlur(phase.key, event) },
                    onToggle: () => { this.#togglePhase(phase.key) },
                    open: disclosure.open,
                    pendingCleanCollapse: disclosure.pendingCleanCollapse,
                    phase: phase,
                    navigable: navigable,
                    openSession: openSession,
                    t: t,
                  })
                )
              }),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-workflow-run-panel') === undefined) {
  customElements.define('freddie-workflow-run-panel', FreddieWorkflowRunPanel)
}

/**
 * Create (if needed) or update a WorkflowRunPanel element in place.
 * @param el - an existing `freddie-workflow-run-panel` element to update, or null to create one.
 * @param props - see {@link WorkflowRunPanelProps}.
 * @returns the `freddie-workflow-run-panel` element; keep it and pass it back in to update.
 */
export function renderWorkflowRunPanel(el, props) {
  const target = el ?? document.createElement('freddie-workflow-run-panel')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function WorkflowRunPanel(props) {
  return renderWorkflowRunPanel(null, props)
}
