
import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'

export const name = 'tmux-context'

export const inject = ['agents']

export const Config = z.object({
  refreshIntervalMs: z.number(),
})

const TMUX_FIELDS = [
  '#{session_name}',
  '#{window_index}',
  '#{window_name}',
  '#{pane_index}',
  '#{pane_id}',
  '#{window_active}',
  '#{pane_active}',
  '#{window_layout}',
]

const PANE_ID = /^%\d+$/u

const ABSENT = Object.freeze({ kind: 'absent' })

const UNREADABLE = Object.freeze({ kind: 'unreadable' })

const READING_PREFIX = 'tmux location (turn '

const FIELD_SEP = '\\t'

async function queryTmuxLocation(bash, logger, processId, signal) {
  const format = TMUX_FIELDS.join(FIELD_SEP)
  const command = [
    '[ -n "$TMUX_PANE" ] || exit 1',
    `self_tty=$(ps -o tty= -p ${processId} | tr -d ' ')`,
    '[ -n "$self_tty" ] || exit 1',
    'pane_tty=$(tmux display-message -t "$TMUX_PANE" -p \'#{pane_tty}\') || exit 1',
    '[ "$pane_tty" = "/dev/$self_tty" ] || exit 1',
    `exec tmux display-message -t "$TMUX_PANE" -p '${format}'`,
  ].join('\n')
  let result
  try {
    result = await bash.run(bash.resolve({ command, signal }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`tmux location query failed: ${message}; injecting no tmux location for the rest of this process`)
    return ABSENT
  }
  if (result.timedOut || result.aborted || result.exitCode === null) return UNREADABLE
  if (result.exitCode !== 0) return ABSENT
  const line = result.stdout.text.split('\n', 1)[0]
  const parts = line.split(FIELD_SEP)
  if (parts.length !== TMUX_FIELDS.length) return UNREADABLE
  const [
    sessionName,
    windowIndex,
    windowName,
    paneIndex,
    paneId,
    windowActive,
    paneActive,
    windowLayout,
  ] = parts
  if (paneId.length === 0) return UNREADABLE
  return {
    kind: 'located',
    location: {
      sessionName,
      windowIndex,
      windowName,
      paneIndex,
      paneId,
      windowActive,
      paneActive,
      windowLayout,
    },
  }
}

function renderState(location) {
  return `session ${location.sessionName}, `
    + `window ${location.windowIndex} ${JSON.stringify(location.windowName)}, `
    + `pane ${location.paneIndex} ${location.paneId}\n`
    + `window active=${location.windowActive}, pane active=${location.paneActive}, `
    + `layout ${location.windowLayout}`
}

function renderReading(location, turn) {
  return `${READING_PREFIX}${turn}):\n${renderState(location)}`
}

function latestInjectedState(agent) {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === name) {
      const [block] = event.data.content
      if (block?.type !== 'text') return undefined
      const newline = block.text.indexOf('\n')
      const state = newline === -1 ? '' : block.text.slice(newline + 1)
      return { state, time: event.time }
    }
  }
  return undefined
}

function validateRefreshInterval(refreshIntervalMs) {
  if (refreshIntervalMs !== undefined && (
    !Number.isSafeInteger(refreshIntervalMs)
    || refreshIntervalMs < 0
  )) {
    throw new TypeError(
      `tmux-context: refreshIntervalMs must be a non-negative safe integer, got ${String(refreshIntervalMs)}`,
    )
  }
}

export function apply(ctx, config) {
  const refreshIntervalMs = config.refreshIntervalMs
  validateRefreshInterval(refreshIntervalMs)
  if (process.platform === 'win32' || !PANE_ID.test(process.env.TMUX_PANE ?? '')) return
  let paneAbsent = false

  ctx.on('agent/pre-step', async (
    { agent, turn, step, signal },
    next,
  ) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1 || paneAbsent) return decision
    const bash = ctx.get('shell')
    if (bash === undefined) return decision
    const previous = latestInjectedState(agent)
    if (refreshIntervalMs !== undefined && refreshIntervalMs > 0 && previous !== undefined) {
      const now = Date.now()
      if (now >= previous.time && now - previous.time < refreshIntervalMs) return decision
    }
    const outcome = await queryTmuxLocation(bash, ctx.logger, process.pid, signal)
    if (outcome.kind === 'absent') paneAbsent = true
    if (outcome.kind !== 'located') return decision
    const { location } = outcome
    const state = renderState(location)
    if (previous !== undefined && previous.state === state) return decision
    const text = renderReading(location, turn)
    return {
      kind: 'enter',
      messages: [
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
        }),
        ...decision.messages,
      ],
    }
  }, { prepend: true })
}
