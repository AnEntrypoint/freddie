import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './ObservabilityDock.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'gm', label: 'GM' },
  { id: 'subagents', label: 'Subagents' },
  { id: 'terminals', label: 'Terminals' },
]

function count(value) {
  return Number.isInteger(value) ? String(value) : undefined
}

function phase(value) {
  if (value?.status === 'running') return value.phase === null ? `Running ${value.verb ?? 'GM'}` : value.phase
  if (value?.phase !== null && value?.phase !== undefined) return value.phase
  return 'No GM checkpoint'
}

function gmProgressDetail(value) {
  if (value?.status === 'running') return `${value.verb ?? 'GM dispatch'} running since ${relativeAge(value.startedAt)}`
  const planned = count(value?.prdPendingCount)
  const obligations = count(value?.mutablesPendingCount)
  const state = [planned === undefined ? undefined : `${planned} planned`, obligations === undefined ? undefined : `${obligations} obligations`].filter(Boolean)
  if (value?.status === 'failed') state.unshift(`Failed ${value.verb ?? 'GM dispatch'}${value.error === null || value.error === undefined ? '' : `: ${value.error}`}`)
  if (value?.durationMs !== null && value?.durationMs !== undefined) state.push(`last dispatch ${formatDuration(value.durationMs)}`)
  return state.length === 0 ? 'No GM dispatch has completed in this session.' : state.join(' · ')
}

function connectionLabel(state) {
  switch (state) {
    case 'connected': return 'Realtime connected'
    case 'reconnecting': return 'Reconnecting live updates'
    case 'offline': return 'Realtime updates offline'
    default: return 'Connecting live updates'
  }
}

function terminalStatus(terminal) {
  return terminal.status?.kind === 'exited'
    ? `Exited ${terminal.status.exitCode ?? terminal.status.signal ?? ''}`.trim()
    : 'Running'
}

function latestWorkflow(workflow) {
  if (workflow === undefined) return undefined
  return workflow.runs?.at(-1) ?? workflow
}

function sessionLabel(row) {
  const title = compactText(row.displayTitle ?? row.title)
  return title === undefined ? `GM session ${row.id.slice(0, 8)}` : `${title} (${row.id.slice(0, 8)})`
}

function workflowRuns(nodes) {
  return nodes.filter(node => node.kind === 'workflow-run').map(node => node.data)
}

function compactText(value) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length <= 160 ? text : `${text.slice(0, 157)}…`
}

function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return undefined
  return compactText(blocks.find(block => typeof block?.text === 'string' && block.text.trim() !== '')?.text)
}

function toolSummary(root) {
  const description = compactText(root?.callView?.description)
  if (description !== undefined) return description
  if (typeof root?.call?.argsRaw !== 'string') return root?.status === 'running' ? 'Running now.' : 'Tool operation completed.'
  try {
    const args = JSON.parse(root.call.argsRaw)
    for (const key of ['description', 'command', 'query', 'path']) {
      const value = compactText(args?.[key])
      if (value !== undefined) return value
    }
  } catch {}
  return root?.status === 'running' ? 'Running now.' : 'Tool operation completed.'
}

function selectedActivities(nodes) {
  const activities = []
  for (const node of [...nodes].reverse()) {
    if (node.kind === 'workflow-run') {
      activities.push({ key: node.key, label: `Workflow · ${node.data.name}`, detail: `${node.data.status} · ${node.data.currentPhase ?? 'no active phase'}` })
    } else if (node.kind === 'tool-call') {
      const root = node.data?.root
      const name = root?.call?.name ?? root?.name ?? root?.callView?.title ?? root?.resultView?.title
      const title = compactText(name)
      if (title !== undefined) activities.push({ key: node.key, label: `Tool · ${title}`, detail: toolSummary(root) })
    } else if (node.kind === 'assistant' || node.kind === 'assistant-step') {
      const text = textFromBlocks(node.data?.blocks)
      if (text !== undefined) activities.push({ key: node.key, label: 'Agent response', detail: text.slice(0, 180) })
    }
    if (activities.length === 3) break
  }
  return activities
}

function operationLabel(name) {
  if (typeof name !== 'string' || name === '') return 'Agent operation'
  const words = name.split('_').filter(Boolean)
  if (words.length === 0) return name
  return words.map(word => word === 'gm' ? 'GM' : `${word[0].toUpperCase()}${word.slice(1)}`).join(' · ')
}

function observedEvent(entry, labels) {
  const event = entry.event
  if (event.type === 'tool-workflow/log') return { key: `${entry.sessionId}:${event.seq}`, label: `Child workflow · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: event.data.message }
  if (event.type === 'tool-workflow/phase') return { key: `${entry.sessionId}:${event.seq}`, label: `Child workflow · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: `Phase: ${event.data.title}` }
  if (event.type === 'gm/progress') return { key: `${entry.sessionId}:${event.seq}`, label: `Child GM · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: event.data.status === 'running' ? `Running ${event.data.verb ?? 'GM dispatch'}` : event.data.status === 'failed' ? `Failed ${event.data.verb ?? 'GM dispatch'}` : event.data.phase ?? `Completed ${event.data.verb ?? 'GM dispatch'}` }
  if (event.type === 'tool/call') return { key: `${entry.sessionId}:${event.seq}`, label: `Child tool · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: operationLabel(event.data.name) }
  return undefined
}

function latestActivityBySession(entries) {
  const latest = new Map()
  for (const entry of entries) {
    if (observedEvent(entry, new Map()) !== undefined) latest.set(entry.sessionId, entry)
  }
  return latest
}

function relativeAge(time, now = Date.now()) {
  if (!Number.isFinite(time)) return 'time unavailable'
  const elapsed = Math.max(0, now - time)
  if (elapsed < 1_000) return 'just now'
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s ago`
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  return `${Math.floor(elapsed / 3_600_000)}h ago`
}

function activityDetail(entry) {
  if (entry === undefined) return 'No action reported for this connection.'
  return `Last observed ${relativeAge(entry.event.time)}: ${observedEvent(entry, new Map()).detail}`
}

function activityRows(entries, rows, labels) {
  const latest = latestActivityBySession(entries)
  return rows.map((row) => {
    const entry = latest.get(row.id)
    const activity = entry === undefined ? undefined : observedEvent(entry, labels)
    const running = row.running === true
    const state = running ? 'Working now' : row.gm?.status === 'failed' ? 'GM needs attention' : row.gm?.phase !== null && row.gm?.phase !== undefined ? 'GM checkpoint retained' : 'Last observed'
    const detail = activity === undefined
      ? running ? 'Running; no semantic operation has arrived yet.' : 'No recent semantic operation reported.'
      : `${activity.detail} · ${relativeAge(entry.event.time)}`
    return { ...row, activity, state, detail, running }
  }).sort((left, right) => Number(right.running) - Number(left.running)
    || (right.activity?.key ?? '').localeCompare(left.activity?.key ?? ''))
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

function sessionWorkDetail(stats) {
  if (stats === undefined || stats.steps <= 0) return undefined
  const parts = [`${stats.turns} turn${stats.turns === 1 ? '' : 's'} · ${stats.steps} step${stats.steps === 1 ? '' : 's'}`]
  const llm = formatDuration(stats.llmMs)
  const tools = formatDuration(stats.toolMs)
  if (llm !== undefined) parts.push(`LLM ${llm}`)
  if (tools !== undefined) parts.push(`tools ${tools}`)
  return parts.join(' · ')
}

function todoDetail(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return undefined
  const done = todos.filter(item => item.status === 'completed').length
  const active = todos.filter(item => item.status === 'in_progress')
  const pending = todos.length - done - active.length
  const detail = [`${done}/${todos.length} completed`]
  if (active.length > 0) detail.push(`${active.length} active`)
  if (pending > 0) detail.push(`${pending} pending`)
  return { value: active[0]?.content ?? `${active.length} active`, detail: detail.join(' · ') }
}

function jobDetail(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return undefined
  const live = jobs.filter(job => job.status === 'running' || job.status === 'queued')
  const names = live.map(job => compactText(job.title ?? job.name ?? job.kind)).filter(Boolean)
  return { value: live.length > 0 ? `${live.length} active` : `${jobs.length} retained`, detail: names.length > 0 ? names.slice(0, 2).join(' · ') : 'Background work is retained for this session.' }
}

function attentionState(snapshot) {
  if (snapshot.promptError !== null) return { label: 'Action needed', detail: snapshot.promptError.error?.message ?? 'The latest agent action failed.' }
  const pending = snapshot.pending ?? []
  if (pending.length > 0) {
    const approvals = pending.filter(wait => wait.kind === 'approval').length
    const questions = pending.filter(wait => wait.kind === 'question').length
    const needs = [
      approvals > 0 ? `${approvals} approval${approvals === 1 ? '' : 's'}` : undefined,
      questions > 0 ? `${questions} question${questions === 1 ? '' : 's'}` : undefined,
    ].filter(Boolean)
    return { label: 'Waiting for you', detail: `${needs.join(' · ') || `${pending.length} response${pending.length === 1 ? '' : 's'}`} needed to continue.` }
  }
  const queue = snapshot.queue ?? []
  if (queue.length > 0) return { label: 'Queued work', detail: `${queue.length} message${queue.length === 1 ? '' : 's'} waiting for the next turn.` }
  if (snapshot.running) return { label: 'Working', detail: 'The agent is processing the current turn.' }
  return { label: 'Ready', detail: 'No action is waiting in this session.' }
}

function descendantsOf(summaries, sessionId) {
  const byId = summaries.byId ?? {}
  const queue = [sessionId]
  const seen = new Set(queue)
  let total = 0
  let running = 0
  while (queue.length > 0) {
    const parentId = queue.shift()
    for (const summary of Object.values(byId)) {
      if (summary.origin !== 'subagent' || summary.parentId !== parentId || seen.has(summary.id)) continue
      seen.add(summary.id)
      queue.push(summary.id)
      total += 1
      if (summary.running) running += 1
    }
  }
  const rows = [...seen].slice(1).map(id => byId[id]).filter(Boolean)
  const directRows = rows.filter(row => row.parentId === sessionId)
  const directRunning = directRows.filter(row => row.running).length
  return { total, running, rows, directRows, directRunning }
}

export class FreddieObservabilityDock extends HTMLElement {
  #props = null
  #snapshots = new Map()
  #terminalError = null
  #section = 'overview'

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #captureSnapshot(terminal) {
    const props = this.#props
    if (props === null) return
    void props.snapshotTerminal(terminal.sessionId).then((response) => {
      if (response.result?.ok !== true) return
      this.#snapshots.set(terminal.sessionId, response.result.value.output.text)
      this.#render()
    })
  }

  #send(terminal, data) {
    const props = this.#props
    if (props === null || data.length === 0) return
    void props.inputTerminal(terminal.sessionId, data).then((response) => {
      this.#terminalError = response.result?.ok === true ? null : response.result?.error?.message ?? 'Terminal input was rejected'
      this.#render()
    })
  }

  #openTerminal() {
    const props = this.#props
    if (props === null) return
    void props.openTerminal().then((response) => {
      this.#terminalError = response.result?.ok === true ? null : response.result?.error?.message ?? 'Terminal creation was rejected'
      this.#render()
    })
  }

  #select(section) {
    this.#section = section
    this.#render()
  }

  #metric(label, value, detail) {
    return h('article', { class: css.metric ?? '' },
      h('span', { class: css.label ?? '' }, label),
      h('strong', { class: css.value ?? '' }, value),
      h('span', { class: css.detail ?? '' }, detail),
    )
  }

  #terminal(terminal, interactive) {
    const running = terminal.status?.kind !== 'exited'
    return h('article', { key: `${terminal.sessionId}:${terminal.name ?? ''}`, class: css.terminal ?? '', 'data-terminal-id': terminal.sessionId },
      h('div', { class: css.terminalHeader ?? '' },
        h('code', null, terminal.name ?? terminal.sessionId),
        terminal.observerLabel === undefined ? null : h('span', { class: css.terminalOwner ?? '' }, terminal.observerLabel),
        h('span', { class: css.terminalStatus ?? '' }, terminalStatus(terminal)),
      ),
      h('pre', { class: css.output ?? '', 'aria-label': `Terminal output for ${terminal.name ?? terminal.sessionId}` }, terminal.output || terminal.motd || ''),
      this.#snapshots.get(terminal.sessionId) === undefined ? null : h('pre', { class: css.snapshot ?? '', 'aria-label': 'Terminal snapshot' }, this.#snapshots.get(terminal.sessionId)),
      !interactive || !running ? null : h('input', {
        class: css.input ?? '',
        'aria-label': `Input for terminal ${terminal.name ?? terminal.sessionId}`,
        placeholder: 'Command or terminal input',
        onkeydown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            const data = event.target.value
            event.target.value = ''
            this.#send(terminal, `${data}\r`)
          } else if (event.key === 'Escape' || (event.ctrlKey && event.key.toLowerCase() === 'c')) {
            event.preventDefault()
            this.#send(terminal, '\u0003')
          }
        },
      }),
      !interactive ? null : h('div', { class: css.controls ?? '' },
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { this.#captureSnapshot(terminal) } }, 'Snapshot'),
        !running ? null : h('button', { type: 'button', class: css.action ?? '', onclick: () => { this.#send(terminal, '\u0003') } }, 'Interrupt'),
        !running ? null : h('button', { type: 'button', class: css.action ?? '', onclick: () => { void this.#props.closeTerminal(terminal.sessionId) } }, 'Close'),
      ),
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const gm = props.useProjection('gmProgress')
    const todos = props.useProjection('todos')
    const todo = todoDetail(todos)
    const sessionStats = props.useProjection('sessionStats')
    const workflow = latestWorkflow(props.useProjection('workflow'))
    const connection = props.useConnection(state => state)
    const terminals = props.useTerminals(state => state)
    const sessionSnapshot = props.useSession(snapshot => snapshot)
    const nodes = [...sessionSnapshot.chat.nodes.values()]
    const attention = attentionState(sessionSnapshot)
    const summaries = props.useSessions(state => state)
    const jobs = summaries.jobsBySession?.[props.sessionId] ?? []
    const job = jobDetail(jobs)
    const descendants = descendantsOf(summaries, props.sessionId)
    const treeActivity = props.useTreeActivity(state => state)
    const treeTerminals = props.useTreeTerminals(state => state)
    const descendantRows = descendants.rows.map(row => ({
      id: row.id,
      displayTitle: row.displayTitle,
      title: row.title,
      label: sessionLabel(row),
      running: row.running,
      gm: row.projectionValues?.gmProgress,
      workflow: row.projectionValues?.workflow,
    }))
    const descendantIds = new Set(descendantRows.map(row => row.id))
    const descendantLabels = new Map(descendantRows.map(row => [row.id, row.label]))
    const childActivityEntries = treeActivity.filter(entry => descendantIds.has(entry.sessionId))
    const childActivity = childActivityEntries.slice(-40).reverse().map(entry => observedEvent(entry, descendantLabels)).filter(Boolean)
    const latestChildActivity = latestActivityBySession(childActivityEntries)
    const boardRows = activityRows(childActivityEntries, descendantRows, descendantLabels)
    const childTerminals = treeTerminals.filter(entry => descendantIds.has(entry.sessionId)).map(entry => ({ ...entry.terminal, observerLabel: descendantLabels.get(entry.sessionId) ?? entry.sessionId }))
    const runs = workflowRuns(nodes)
    const currentActivities = selectedActivities(nodes)
    const currentActivity = currentActivities[0]
    const now = todo === undefined
      ? currentActivity === undefined
        ? { label: gm?.status === 'running' ? `GM ${phase(gm)}` : 'Waiting', detail: gmProgressDetail(gm) }
        : currentActivity
      : { label: todo.value, detail: todo.detail }
    const active = this.#section
    const terminalPanel = h('section', { class: css.panel ?? '', 'data-observability-terminals': '' },
      h('div', { class: css.panelHeader ?? '' }, h('h2', null, 'Interactive terminals'), h('button', { type: 'button', class: css.action ?? '', onclick: () => { this.#openTerminal() } }, 'Open terminal')),
      h('p', { class: css.panelCopy ?? '' }, this.#terminalError ?? 'Parent controls remain interactive. Descendant terminals are observed read-only through their owner-scoped activity streams.'),
      terminals.length === 0 ? h('p', { class: css.empty ?? '' }, 'No terminal is open for this session.') : terminals.map(terminal => this.#terminal(terminal, true)),
      childTerminals.length === 0 ? null : h('section', { class: css.treeActivity ?? '' }, h('h3', null, 'Descendant terminal activity'), childTerminals.map(terminal => this.#terminal(terminal, false))),
    )
    const workflowPanel = h('section', { class: css.panel ?? '', 'data-observability-workflows': '' },
      h('h2', null, 'Workflow activity'),
      runs.length === 0 ? h('p', { class: css.empty ?? '' }, 'No workflow run is recorded in this session.') : runs.map(run => h('article', { key: `${run.name}:${run.currentPhase ?? ''}`, class: css.activity ?? '' },
        this.#metric(run.name, run.status, run.currentPhase ?? 'No active phase.'),
        run.logs.length === 0 ? null : h('ol', { class: css.logList ?? '', 'aria-label': `${run.name} logs` }, run.logs.map(log => h('li', { key: log.seq }, log.message))),
        run.phases.map(group => h('div', { key: group.key, class: css.memberGroup ?? '' }, h('strong', null, group.phase ?? 'Unassigned'), group.members.map(member => h('p', { key: member.seq }, `${member.label} · ${member.status}`)))),
      )),
      descendantRows.filter(row => row.workflow !== undefined).map(row => this.#metric(`Child workflow · ${row.label}`, row.workflow.status ?? 'active', row.workflow.currentPhase ?? row.workflow.name ?? 'Live child workflow projection.')),
    )
    const subagentPanel = h('section', { class: css.panel ?? '', 'data-observability-subagents': '' },
      h('h2', null, 'Agent tree'),
      this.#metric('Direct subagents', `${descendants.directRows.length} total · ${descendants.directRunning} running`, 'Work this session started directly; the full descendant tree remains listed below.'),
      this.#metric('Nested descendants', `${descendants.total - descendants.directRows.length} total · ${descendants.running - descendants.directRunning} running`, 'Subagents started by a direct child.'),
      descendants.rows.length === 0 ? h('p', { class: css.empty ?? '' }, 'No subagent descendants are recorded.') : h('ol', { class: css.logList ?? '' }, boardRows.map(row => h('li', { key: row.id },
        h('strong', null, `${row.label} · ${row.state}`),
        h('span', null, `${row.gm?.status === 'running' ? `GM ${phase(row.gm)} · ` : ''}${row.detail}`),
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { props.openSession(row.id) } }, 'Inspect session'),
      ))),
    )
    const priority = h('section', { class: css.priority ?? '', 'aria-label': 'Current work' },
      h('div', { class: css.priorityState ?? '', 'data-attention': attention.label.toLowerCase().replaceAll(' ', '-') },
        h('span', { class: css.label ?? '' }, 'Current work'),
        h('strong', { class: css.value ?? '' }, attention.label),
        h('span', { class: css.detail ?? '' }, attention.detail),
      ),
      h('div', { class: css.priorityState ?? '' },
        h('span', { class: css.label ?? '' }, 'Now'),
        h('strong', { class: css.value ?? '' }, now.label),
        h('span', { class: css.detail ?? '' }, now.detail),
      ),
      todo === undefined ? null : h('div', { class: css.priorityState ?? '' },
        h('span', { class: css.label ?? '' }, 'Plan'),
        h('strong', { class: css.value ?? '' }, todo.value),
        h('span', { class: css.detail ?? '' }, todo.detail),
      ),
      descendants.running === 0 ? null : h('button', { type: 'button', class: css.priorityAction ?? '', onclick: () => { this.#select('subagents') } }, `${descendants.running} subagent${descendants.running === 1 ? '' : 's'} running`),
      gm?.status === 'idle' || gm === undefined ? null : h('button', { type: 'button', class: css.priorityAction ?? '', onclick: () => { this.#select('gm') } }, gm.status === 'running' ? `Open GM ${phase(gm)}` : 'Open GM history'),
    )
    const content = active === 'terminals'
      ? terminalPanel
      : active === 'gm'
        ? h('section', { class: css.panel ?? '', 'data-observability-gm': '' },
          h('h2', null, 'GM sessions'),
          this.#metric('Current session', phase(gm), gmProgressDetail(gm)),
          descendantRows.filter(row => row.gm?.status !== undefined && (row.running || row.gm.status !== 'idle')).map(row => h('article', { key: row.id, class: css.metric ?? '' },
            h('span', { class: css.label ?? '' }, row.label),
            h('strong', { class: css.value ?? '' }, phase(row.gm)),
            h('span', { class: css.detail ?? '' }, gmProgressDetail(row.gm)),
            h('button', { type: 'button', class: css.action ?? '', onclick: () => { props.openSession(row.id) } }, 'Inspect session'),
          )),
        )
        : active === 'workflows'
          ? workflowPanel
          : active === 'subagents'
            ? subagentPanel
            : h('section', { class: css.panel ?? '', 'data-observability-overview': '' },
              h('div', { class: css.metrics ?? '' },
                this.#metric('Attention', attention.label, attention.detail),
                this.#metric('Connection', connectionLabel(connection), connection === 'connected' ? 'Live agent and server events are flowing.' : 'The client will reconnect automatically when the stream is available.'),
                this.#metric('Latest activity', now.label, now.detail),
                this.#metric('GM', phase(gm), gmProgressDetail(gm)),
                todo === undefined ? null : this.#metric('Plan', todo.value, todo.detail),
                this.#metric('Workflow', workflow?.status ?? 'No active run', workflow?.currentPhase ?? workflow?.name ?? 'No current workflow phase.'),
                sessionWorkDetail(sessionStats) === undefined ? null : this.#metric('Session work', `${sessionStats.turns} turn${sessionStats.turns === 1 ? '' : 's'}`, sessionWorkDetail(sessionStats)),
                job === undefined ? null : this.#metric('Background jobs', job.value, job.detail),
                this.#metric('Direct subagents', `${descendants.directRows.length} total · ${descendants.directRunning} running`, 'Work started by this session; open Subagents for the full tree and current action.'),
                this.#metric('Terminals', terminals.length === 0 ? 'PTY-ready' : `${terminals.length} observed`, 'Live agent command output and lifecycle state.'),
              ),
              currentActivities.slice(1).map(activity => h('article', { key: activity.key, class: css.metric ?? '' },
                h('span', { class: css.label ?? '' }, `Earlier · ${activity.label}`),
                h('span', { class: css.detail ?? '' }, activity.detail),
              )),
              h('section', { class: css.activityBoard ?? '', 'aria-label': 'Board-wide agent activity' },
                h('div', { class: css.panelHeader ?? '' },
                  h('h2', null, 'Across the board'),
                  h('span', { class: css.panelCopy ?? '' }, `${boardRows.filter(row => row.running).length} working · ${boardRows.length - boardRows.filter(row => row.running).length} last observed`),
                ),
                boardRows.length === 0 ? h('p', { class: css.empty ?? '' }, 'No subagent activity is available yet. New work appears here as it reaches the realtime stream.') : h('ol', { class: css.logList ?? '' }, boardRows.map(row => h('li', { key: row.id, class: css.boardRow ?? '', 'data-state': row.running ? 'working' : 'observed' },
                  h('div', null,
                    h('strong', null, row.label),
                    h('span', { class: css.boardState ?? '' }, row.gm?.status === 'running' ? `GM ${phase(row.gm)} · ${row.state}` : row.state),
                    h('span', { class: css.detail ?? '' }, row.detail),
                  ),
                  h('button', { type: 'button', class: css.action ?? '', onclick: () => { props.openSession(row.id) } }, 'Inspect session'),
                ))),
              ),
            )
    applyDiff(this, h('section', {
      class: css.root ?? '',
      'data-observability-view': '',
      role: 'region',
      'aria-labelledby': 'freddie-observability-title',
    },
      h('header', { class: css.bluf ?? '' },
        h('div', { class: css.connection ?? '', 'data-state': connection, role: 'status', 'aria-live': 'polite' },
          h('span', { class: css.connectionDot ?? '', 'aria-hidden': true }),
          connectionLabel(connection),
        ),
        h('h1', { id: 'freddie-observability-title' }, 'Live operations'),
        h('p', null, `${descendants.directRunning} direct and ${descendants.running - descendants.directRunning} nested subagents running.`),
      ),
      h('nav', { class: css.tabs ?? '', role: 'tablist', 'aria-label': 'Operational views' },
        SECTIONS.map(section => h('button', {
          key: section.id,
          id: `freddie-observability-tab-${section.id}`,
          type: 'button',
          role: 'tab',
          ...active === section.id ? { 'aria-controls': `freddie-observability-panel-${section.id}` } : {},
          'aria-selected': active === section.id,
          class: active === section.id ? css.tabActive ?? '' : css.tab ?? '',
          onclick: () => { this.#select(section.id) },
        }, section.label)),
      ),
      active === 'overview' ? priority : null,
      h('div', {
        id: `freddie-observability-panel-${active}`,
        role: 'tabpanel',
        'aria-labelledby': `freddie-observability-tab-${active}`,
      }, content),
    ))
  }
}

defineElement('freddie-observability-dock', FreddieObservabilityDock)
