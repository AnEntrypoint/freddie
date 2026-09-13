import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './ObservabilityDock.css.js'

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
  if (!value?.active) return 'Waiting for GM activity'
  return value.phase ?? 'Active'
}

function gmProgressDetail(value) {
  if (!value?.active) return 'No current GM state reported.'
  const planned = count(value.prdPendingCount)
  const obligations = count(value.mutablesPendingCount)
  if (planned === undefined && obligations === undefined) return 'Work counts not reported.'
  return [planned === undefined ? undefined : `${planned} planned`, obligations === undefined ? undefined : `${obligations} obligations`].filter(Boolean).join(' · ')
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
  return `GM session ${row.id.slice(0, 8)}`
}

function workflowRuns(nodes) {
  return nodes.filter(node => node.kind === 'workflow-run').map(node => node.data)
}

function observedEvent(entry, labels) {
  const event = entry.event
  if (event.type === 'tool-workflow/log') return { key: `${entry.sessionId}:${event.seq}`, label: `Child workflow · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: event.data.message }
  if (event.type === 'tool-workflow/phase') return { key: `${entry.sessionId}:${event.seq}`, label: `Child workflow · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: `Phase: ${event.data.title}` }
  if (event.type === 'gm/progress') return { key: `${entry.sessionId}:${event.seq}`, label: `Child GM · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: event.data.phase ?? 'Progress recorded' }
  if (event.type === 'tool/call') return { key: `${entry.sessionId}:${event.seq}`, label: `Child tool · ${labels.get(entry.sessionId) ?? entry.sessionId}`, detail: event.data.name ?? 'Agent operation' }
  return undefined
}

function latestActivityBySession(entries) {
  const latest = new Map()
  for (const entry of entries) {
    if (observedEvent(entry, new Map()) !== undefined) latest.set(entry.sessionId, entry)
  }
  return latest
}

function activityDetail(entry) {
  if (entry === undefined) return 'No action reported for this connection.'
  return `Last observed: ${observedEvent(entry, new Map()).detail}`
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
      if (response.result?.ok !== true) {
        this.#terminalError = response.result?.error?.message ?? 'Terminal input was rejected'
        this.#render()
      }
    })
  }

  #openTerminal() {
    const props = this.#props
    if (props === null) return
    void props.openTerminal().then((response) => {
      if (response.result?.ok !== true) {
        this.#terminalError = response.result?.error?.message ?? 'Terminal creation was rejected'
        this.#render()
      }
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
    return h('article', { key: `${terminal.sessionId}:${terminal.name ?? ''}`, class: css.terminal ?? '', 'data-terminal-id': terminal.sessionId },
      h('div', { class: css.terminalHeader ?? '' },
        h('code', null, terminal.name ?? terminal.sessionId),
        terminal.observerLabel === undefined ? null : h('span', { class: css.terminalOwner ?? '' }, terminal.observerLabel),
        h('span', { class: css.terminalStatus ?? '' }, terminalStatus(terminal)),
      ),
      h('pre', { class: css.output ?? '', 'aria-label': `Terminal output for ${terminal.name ?? terminal.sessionId}` }, terminal.output || terminal.motd || ''),
      this.#snapshots.get(terminal.sessionId) === undefined ? null : h('pre', { class: css.snapshot ?? '', 'aria-label': 'Terminal snapshot' }, this.#snapshots.get(terminal.sessionId)),
      !interactive ? null : h('input', {
        class: css.input ?? '', placeholder: 'Command or terminal input',
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
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { void this.#props.resizeTerminal(terminal.sessionId, 100, 30) } }, '100×30'),
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { this.#send(terminal, '\u0003') } }, 'Interrupt'),
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { void this.#props.closeTerminal(terminal.sessionId) } }, 'Close'),
      ),
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const gm = props.useProjection('gmProgress')
    const workflow = latestWorkflow(props.useProjection('workflow'))
    const connection = props.useConnection(state => state)
    const terminals = props.useTerminals(state => state)
    const nodes = props.useSession(snapshot => [...snapshot.chat.nodes.values()])
    const summaries = props.useSessions(state => state)
    const descendants = descendantsOf(summaries, props.sessionId)
    const treeActivity = props.useTreeActivity(state => state)
    const treeTerminals = props.useTreeTerminals(state => state)
    const descendantRows = descendants.rows.map(row => ({
      id: row.id,
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
    const childTerminals = treeTerminals.filter(entry => descendantIds.has(entry.sessionId)).map(entry => ({ ...entry.terminal, observerLabel: descendantLabels.get(entry.sessionId) ?? entry.sessionId }))
    const runs = workflowRuns(nodes)
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
      descendants.rows.length === 0 ? h('p', { class: css.empty ?? '' }, 'No subagent descendants are recorded.') : h('ol', { class: css.logList ?? '' }, descendantRows.map(row => h('li', { key: row.id },
        h('strong', null, `${row.label} · ${row.running ? 'running' : 'idle'}`),
        h('span', null, `${row.gm?.active ? `GM ${phase(row.gm)} · ` : ''}${activityDetail(latestChildActivity.get(row.id))}`),
        h('button', { type: 'button', class: css.action ?? '', onclick: () => { props.openSession(row.id) } }, 'Inspect session'),
      ))),
    )
    const content = active === 'terminals'
      ? terminalPanel
      : active === 'gm'
        ? h('section', { class: css.panel ?? '', 'data-observability-gm': '' }, h('h2', null, 'GM sessions'), this.#metric('Current session', phase(gm), gmProgressDetail(gm)), descendantRows.filter(row => row.running && row.gm?.active).map(row => this.#metric(row.label, phase(row.gm), gmProgressDetail(row.gm))))
        : active === 'workflows'
          ? workflowPanel
          : active === 'subagents'
            ? subagentPanel
            : h('section', { class: css.panel ?? '', 'data-observability-overview': '' },
              h('div', { class: css.metrics ?? '' },
                this.#metric('Connection', connectionLabel(connection), connection === 'connected' ? 'Live events are flowing from the agent and server.' : 'The client will reconnect automatically when the stream is available.'),
                this.#metric('GM', phase(gm), gmProgressDetail(gm)),
                this.#metric('Workflow', workflow?.status ?? 'No active run', workflow?.currentPhase ?? workflow?.name ?? 'No current workflow phase.'),
                this.#metric('Direct subagents', `${descendants.directRows.length} total · ${descendants.directRunning} running`, 'Work started by this session; open Subagents for the full tree and current action.'),
                this.#metric('Terminals', terminals.length === 0 ? 'PTY-ready' : `${terminals.length} observed`, 'Live agent command output and lifecycle state.'),
              ),
              descendantRows.filter(row => row.running).slice(0, 5).map(row => h('article', { class: css.metric ?? '' },
                h('span', { class: css.label ?? '' }, row.label),
                h('strong', { class: css.value ?? '' }, row.gm?.active ? `GM ${phase(row.gm)}` : row.workflow?.status ?? 'Running'),
                h('span', { class: css.detail ?? '' }, activityDetail(latestChildActivity.get(row.id))),
                h('button', { type: 'button', class: css.action ?? '', onclick: () => { props.openSession(row.id) } }, 'Inspect session'),
              )),
            )
    applyDiff(this, h('section', { class: css.root ?? '', 'data-observability-view': '' },
      h('header', { class: css.bluf ?? '' },
        h('div', { class: css.connection ?? '', 'data-state': connection, role: 'status', 'aria-live': 'polite' },
          h('span', { class: css.connectionDot ?? '', 'aria-hidden': true }),
          connectionLabel(connection),
        ),
        h('h1', null, 'Live operations'),
        h('p', null, `${descendants.directRunning} direct and ${descendants.running - descendants.directRunning} nested subagents running.`),
      ),
      h('nav', { class: css.tabs ?? '', role: 'tablist', 'aria-label': 'Operational views' },
        SECTIONS.map(section => h('button', { key: section.id, type: 'button', role: 'tab', 'aria-selected': active === section.id, class: active === section.id ? css.tabActive ?? '' : css.tab ?? '', onclick: () => { this.#select(section.id) } }, section.label)),
      ),
      content,
    ))
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-observability-dock') === undefined) {
  customElements.define('freddie-observability-dock', FreddieObservabilityDock)
}
