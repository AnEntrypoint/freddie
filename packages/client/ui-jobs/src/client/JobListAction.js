import { applyDiff, createElement as h } from 'webjsx'
import { IconChevronDownOutline14, StateDot, createDismissOnOutsidePointer } from '@freddie/freddie-client-ui-primitives'
import { NS } from './locales.js'
import css from './JobListAction.css.js'

/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_TASKS = []

/** A job the registry still holds open, and whose duration therefore ticks. */
function isLive(job) {
  return job.status === 'running' || job.status === 'stopping'
}

/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value) {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`)
}

/**
 * Status marker semantics. `stopping` and `killed` share the attention color:
 * both mean the work ended (or is ending) on request rather than on its own.
 */
function dotState(status) {
  switch (status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'completed': return 'done'
    case 'killed': return 'warning'
    case 'failed': return 'error'
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/** Human status word for the row and its accessible name. */
function statusLabel(status, t) {
  switch (status) {
    case 'running': return t('status.running')
    case 'stopping': return t('status.stopping')
    case 'completed': return t('status.completed')
    case 'killed': return t('status.killed')
    case 'failed': return t('status.failed')
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/**
 * Elapsed time in at most two adjacent units. A background job that outlives
 * an hour is already exceptional, so hours is the widest unit — beyond that the
 * figure stays in hours rather than growing a day/month vocabulary no producer
 * currently reaches.
 */
function formatDuration(elapsedMs, t) {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  if (hours > 0) return t('duration.hours', { hours, minutes })
  if (minutes > 0) return t('duration.minutes', { minutes, seconds })
  return t('duration.seconds', { seconds })
}

/**
 * Live rows first in start order, then settled rows newest-first. Two jobs
 * that settled in the same millisecond fall back to start order, so the sort
 * never depends on the host's map iteration.
 */
function ordered(jobs) {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return left.startedAt - right.startedAt
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return finished !== 0 ? finished : left.startedAt - right.startedAt
  })
}

/**
 * Session-header entry point for this session's background jobs custom
 * element (see module doc). Renders nothing at all until the session has at
 * least one job, so an ordinary conversation never grows a control for a
 * capability it is not using.
 *
 * Converted from a React hooks component to a webjsx custom element: `open`/
 * `now` become private fields, the dismiss-on-outside-pointer effect and the
 * live-duration ticker become connectedCallback/disconnectedCallback-managed
 * controllers/timers, and re-render is an explicit applyDiff(this, vdom) call
 * (Toast.tsx's pattern) instead of implicit re-render on setState.
 */
export class FreddieJobListAction extends HTMLElement {
  #props = null
  #open = false
  #now = Date.now()
  #tickTimer = null
  #dismiss = createDismissOnOutsidePointer({ root: this, onDismiss: () => { this.#setOpen(false) } })

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#dismiss.stop()
    this.#stopTick()
  }

  #setOpen(open) {
    if (this.#open === open) return
    this.#open = open
    if (open) {
      this.#now = Date.now()
      this.#dismiss.start()
    } else {
      this.#dismiss.stop()
    }
    this.#syncTick()
    this.#render()
  }

  #syncTick() {
    const props = this.#props
    const jobs = props === null ? NO_TASKS : (props.useSessions(state => state.jobsBySession[props.sessionId]) ?? NO_TASKS)
    const liveCount = jobs.filter(isLive).length
    if (this.#open && liveCount > 0) {
      if (this.#tickTimer === null) {
        this.#tickTimer = setInterval(() => {
          this.#now = Date.now()
          this.#render()
        }, 1_000)
      }
    } else {
      this.#stopTick()
    }
  }

  #stopTick() {
    if (this.#tickTimer !== null) { clearInterval(this.#tickTimer); this.#tickTimer = null }
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, h('span', {style: 'display:none'})); return }
    const { sessionId, useSessions, t } = props
    const jobs = useSessions(state => state.jobsBySession[sessionId]) ?? NO_TASKS

    // The last job disappearing removes this control; close first so focus
    // does not vanish from an unmounting node.
    if (jobs.length === 0 && this.#open) {
      this.#open = false
      this.#dismiss.stop()
      this.#stopTick()
    }

    if (jobs.length === 0) { applyDiff(this, h('span', {style: 'display:none'})); return }

    const rows = ordered(jobs)
    const liveCount = jobs.filter(isLive).length
    const countKey = liveCount > 0
      ? (liveCount === 1 ? 'count.live.one' : 'count.live.other')
      : (jobs.length === 1 ? 'count.idle.one' : 'count.idle.other')
    const countLabel = t(countKey, { count: liveCount > 0 ? liveCount : jobs.length })
    const open = this.#open
    const now = this.#now

    const vdom = (
      h('div', {
        class: css.root ?? '',
        onkeydown: (event) => {
          if (event.key !== 'Escape' || !open) return
          event.preventDefault()
          this.#setOpen(false)
          this.querySelector(`.${css.trigger ?? ''}`)?.focus()
        },
      },
        h('button', {
          type: 'button',
          class: css.trigger ?? '',
          'aria-expanded': String(open),
          'aria-label': countLabel,
          onclick: () => {
            // Sample the clock in the same commit that opens the list: the
            // mount-time value predates every job, so the first painted frame
            // would otherwise clamp a long-running row to zero until the
            // open effect corrects it a frame later.
            this.#now = Date.now()
            this.#setOpen(!open)
          },
        },
          liveCount > 0 ? h(StateDot, {state: 'ongoing', className: css.triggerDot}) : null,
          h('span', {class: css.count ?? ''}, countLabel),
          h(IconChevronDownOutline14, {className: open ? css.triggerOpen : undefined}),
        ),
        open
          ? (
            h('ul', {class: css.menu ?? '', 'aria-label': t('list.aria')},
              rows.map((job) => {
                const live = isLive(job)
                const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt
                const duration = formatDuration(elapsed, t)
                const status = statusLabel(job.status, t)
                return (
                  h('li', {class: live ? (css.row ?? '') : `${css.row ?? ''} ${css.rowSettled ?? ''}`},
                    h(StateDot, {state: dotState(job.status), className: css.rowDot}),
                    h('span', {class: css.kind ?? ''}, job.kind),
                    h('span', {class: css.label ?? '', title: job.label}, job.label),
                    h('span', {class: css.status ?? '', title: job.detail ?? status}, job.detail ?? status),
                    h('span', {
                      class: css.duration ?? '',
                      title: t(live ? 'duration.title.live' : 'duration.title.done', { duration }),
                    },
                      duration,
                    ),
                  )
                )
              }),
            )
          )
          : null,
      )
    )
    applyDiff(this, vdom)
    this.#syncTick()
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-job-list-action') === undefined) {
  customElements.define('freddie-job-list-action', FreddieJobListAction)
}
