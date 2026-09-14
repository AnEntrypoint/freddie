import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './OperationsStrip.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

function attentionState(snapshot) {
  if (snapshot.promptError !== null) return 'Action needed'
  if ((snapshot.pending ?? []).length > 0) return 'Waiting for you'
  if ((snapshot.queue ?? []).length > 0) return 'Queued'
  return snapshot.running ? 'Working' : 'Ready'
}

function connectionLabel(state) {
  switch (state) {
    case 'connected': return 'Live'
    case 'reconnecting': return 'Reconnecting'
    case 'offline': return 'Offline'
    default: return 'Connecting'
  }
}

function todoLabel(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return undefined
  const done = todos.filter(item => item.status === 'completed').length
  const active = todos.filter(item => item.status === 'in_progress').length
  return `Plan ${done}/${todos.length}${active > 0 ? ` / ${active} active` : ''}`
}

function directSubagents(summaries, sessionId) {
  return Object.values(summaries.byId ?? {}).filter(summary => (
    summary.origin === 'subagent' && summary.parentId === sessionId && summary.running
  )).length
}

export class FreddieOperationsStrip extends HTMLElement {
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
    if (props === null) return
    const session = props.useSession(snapshot => snapshot)
    const connection = props.useConnection(state => state)
    const todos = props.useProjection('todos')
    const summaries = props.useSessions(state => state)
    const subagents = directSubagents(summaries, props.sessionId)
    const plan = todoLabel(todos)
    const attention = attentionState(session)
    const work = subagents === 0 ? 'No direct subagents running' : `${subagents} direct subagent${subagents === 1 ? '' : 's'} running`
    applyDiff(this, h('section', {
      class: css.root ?? '',
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Working now',
      'data-operations-strip': '',
      'data-attention': attention.toLowerCase().replaceAll(' ', '-'),
      'data-connection': connection,
    },
    h('strong', { class: css.title ?? '' }, 'Working now'),
    h('span', { class: css.metric ?? '' }, attention),
    h('span', { class: css.metric ?? '' }, connectionLabel(connection)),
    h('span', { class: css.metric ?? '' }, plan ?? 'No active plan'),
    h('span', { class: css.metric ?? '' }, work),
    ))
  }
}

defineElement('freddie-operations-strip', FreddieOperationsStrip)
