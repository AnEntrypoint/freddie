
import { randomUUID } from 'node:crypto'
import z from '@freddie/schemastery'
import { installModelSelection } from '@freddie/freddie-agent'
import { createUserMessage } from '@freddie/freddie-llm'
import { SessionId } from '@freddie/freddie-session'

export const name = 'headless-runner'

export const inject = ['agentDefaultModel', 'agents', 'sessions']

export const Config = z.object({
  task: z.string().required(),
})

export const internals = {
  stdout: process.stdout,
  stderr: process.stderr,
}

function summarize(events, firstSeq) {
  let started = false
  let text = ''
  let reason
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') {
      started = true
      continue
    }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end') reason = event.data.reason
  }
  return { text, reason }
}

function fail(io, error) {
  io.stderr.write(`freddie: ${error instanceof Error ? error.message : String(error)}\n`)
  io.exit(1)
}

async function awaitCompleteApplication(ctx) {
  await ctx.get('loader')?.await()
}

async function run(ctx, task, io) {
  await awaitCompleteApplication(ctx)
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  const treeDisposedWhileSettling = agents === undefined || defaultModel === undefined || sessions === undefined
  if (treeDisposedWhileSettling) return

  const selection = defaultModel.currentSelection()
  const { agent } = await agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
    },
  })
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  await sessions.flush(agent.session)
  const outcome = summarize(agent.session.events, firstSeq)
  io.stdout.write(outcome.text + '\n')
  if (outcome.reason?.kind === 'error') {
    io.stderr.write(`freddie: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`)
  }
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)
}

export function apply(ctx, config) {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('headless-runner: the launcher must provide ctx.appExit before the tree mounts')
  }
  const io = { stdout: internals.stdout, stderr: internals.stderr, exit }
  void run(ctx, config.task, io).catch((error) => { fail(io, error) })
}
