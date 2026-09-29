import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconChevronDownOutline14, StateDot, createDismissOnOutsidePointer, defineElement } from '@freddie/freddie-client-ui-primitives'
import { NS } from './locales.js'
import css from './JobListAction.css.js'

const NO_TASKS = []

function isLive(job) {
  return job.status === 'running' || job.status === 'stopping'
}

function assertNever(value) {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`)
}

function dotState(status) {
  switch (status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'completed': return 'done'
    case 'killed': return 'warning'
    case 'failed': return 'error'
    default: return assertNever(status)
  }
}

function statusLabel(status, t) {
  switch (status) {
    case 'running': return t('status.running')
    case 'stopping': return t('status.stopping')
    case 'completed': return t('status.completed')
    case 'killed': return t('status.killed')
    case 'failed': return t('status.failed')
    default: return assertNever(status)
  }
}

function formatDuration(elapsedMs, t) {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  if (hours > 0) return t('duration.hours', { hours, minutes })
  if (minutes > 0) return t('duration.minutes', { minutes, seconds })
  return t('duration.seconds', { seconds })
}

function ordered(jobs) {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return left.startedAt - right.startedAt
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return finished !== 0 ? finished : left.startedAt - right.startedAt
  })
}

export class FreddieJobListAction extends HTMLElement {
  #props = null
  #open = false
  #now = Date.now()
  #tickTimer = null
  #dismiss = createDismissOnOutsidePointer({ root: this, onDismiss: () => { this.#setOpen(false) } })

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

defineElement('freddie-job-list-action', FreddieJobListAction)
