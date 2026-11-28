import '@freddie/freddie-runtime/install-fx'
import { createUserMessage } from '@freddie/freddie-llm'
import { FxEngine, splitPrompt, toFxProvider } from '../src/index.js'
import { fakeAgent } from './fake-agent.js'

let passed = 0
const check = (condition, message) => {
  if (!condition) throw new Error(message)
}
const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
const test = async (name, run) => {
  await run()
  passed++
  console.log(`ok   ${name}`)
}

const user = text => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const assistant = text => ({ role: 'assistant', content: [{ type: 'text', text }] })
const toolResult = { role: 'user', content: [{ type: 'tool-result', toolCallId: 'x', content: [], isError: false }] }

function harness(script, requestOverrides = {}) {
  const events = []
  const session = { append: (type, data) => { const event = { seq: events.length, type, data }; events.push(event); return event } }
  const fake = fakeAgent(script)
  const calls = []
  const engine = new FxEngine({ createAgent: fake.createAgent, providerFor: name => ({ provider: { name } }) })
  const controller = new AbortController()
  const request = {
    provider: 'deepseek',
    model: 'm1',
    system: 'be brief',
    sessionId: 's1',
    messages: [user('earlier'), assistant('reply'), user('now')],
    tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }, { name: 'read', description: 'read', parameters: { type: 'object' } }],
    ...requestOverrides,
  }
  const run = (runToolCall = async (block) => { calls.push(block); return { content: [{ type: 'text', text: `ran ${block.name}` }], isError: false, concluded: false } }) =>
    engine.step({ request, turn: 1, step: 1, session, signal: controller.signal, runToolCall })
  return { run, events, fake, calls, controller }
}

await test('a text turn is recorded as chunks and one assistant message, and the history becomes the fx context', async () => {
  const h = harness(async function* () {
    yield { type: 'text_delta', text: 'hel' }
    yield { type: 'text_delta', text: 'lo' }
    return { stopReason: 'end_turn' }
  })
  same(await h.run(), { kind: 'completed' }, 'step result')
  const message = h.events.find(event => event.type === 'assistant/message').data.message
  same(message.content, [{ type: 'text', text: 'hello' }], 'assistant content')
  same(message.source, { kind: 'model', provider: 'deepseek', model: 'm1' }, 'assistant source')
  check(h.events.at(-1).type === 'assistant/message', 'the message anchors the chunks')
  same(h.fake.record.prompts[0].input, 'now', 'prompt input')
  same(h.fake.record.sessionOptions.context.length, 2, 'context excludes the trailing user message')
  same(h.fake.record.sessionId, 's1', 'fx session id is the freddie session id')
  same(h.fake.record.created.instructions, 'be brief', 'system context')
  same(h.fake.record.created.nativeTools, false, 'fx native tools stay off')
  same(h.fake.record.created.customProvider, { provider: { name: 'deepseek' } }, 'custom provider')
  same(h.fake.record.created.tools.map(tool => tool.inputSchema), [{ type: 'object' }, { type: 'object' }], 'tool schemas')
})

await test('a tool batch: the assistant message with every call is recorded before the first tool runs, and results go back to fx', async () => {
  const order = []
  const h = harness(async function* ({ execute }) {
    yield { type: 'reasoning_delta', text: 'think' }
    yield { type: 'text_delta', text: 'checking' }
    yield { type: 'tool_start', id: 'c1', name: 'bash', input: { cmd: 'ls' } }
    yield { type: 'tool_start', id: 'c2', name: 'read', input: { path: 'a' } }
    const first = await execute('bash', { cmd: 'ls' }, 'c1')
    const second = await execute('read', { path: 'a' }, 'c2')
    order.push(first.content[0].text, second.content[0].text)
    yield { type: 'text_delta', text: 'done' }
    return { stopReason: 'end_turn' }
  })
  const seenAtFirstRun = []
  await h.run(async (block) => {
    seenAtFirstRun.push(h.events.filter(event => event.type === 'assistant/message').length)
    h.calls.push(block)
    return { content: [{ type: 'text', text: `ran ${block.name}` }], isError: false, concluded: false }
  })
  const messages = h.events.filter(event => event.type === 'assistant/message').map(event => event.data.message.content)
  same(messages[0].map(block => block.type), ['reasoning', 'text', 'tool-call', 'tool-call'], 'first message blocks')
  same(messages[0][2], { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"cmd":"ls"}' }, 'first call block')
  same(messages[1], [{ type: 'text', text: 'done' }], 'second message')
  same(seenAtFirstRun, [1, 1], 'the message was logged before each tool ran')
  same(h.calls.map(call => call.id), ['c1', 'c2'], 'calls handed to the freddie pipeline in order')
  same(order, ['ran bash', 'ran read'], 'results returned to fx')
  const finishes = h.events.filter(event => event.type === 'assistant/chunk' && event.data.chunk.type === 'finish').map(event => event.data.chunk.reason.kind)
  same(finishes, ['tool-calls', 'stop'], 'finish kinds')
})

await test('a tool call matches its tool_start by name when fx gives no execution id', async () => {
  const h = harness(async function* ({ execute }) {
    yield { type: 'tool_start', id: 'c9', name: 'bash', input: {} }
    await execute('bash', {}, undefined)
    return { stopReason: 'end_turn' }
  })
  await h.run()
  same(h.calls.map(call => call.id), ['c9'], 'matched call')
})

await test('a tool that concludes the turn stops fx and completes the step', async () => {
  const h = harness(async function* ({ execute, signal }) {
    yield { type: 'tool_start', id: 'c1', name: 'bash', input: {} }
    await execute('bash', {}, 'c1')
    await new Promise((_, reject) => setTimeout(() => reject(new Error('should have been stopped')), 50))
    return { stopReason: 'end_turn' }
  })
  same(await h.run(async () => ({ content: [], isError: false, concluded: true })), { kind: 'completed' }, 'step result')
})

await test('max_output_tokens ends the step as max-tokens with that finish recorded', async () => {
  const h = harness(async function* () {
    yield { type: 'text_delta', text: 'cut' }
    return { stopReason: 'max_output_tokens' }
  })
  same(await h.run(), { kind: 'max-tokens' }, 'step result')
  same(h.events.at(-2).data.chunk.reason, { kind: 'max-tokens' }, 'finish chunk')
})

await test('an fx error turn is an LlmError and a tool without a tool_start is refused', async () => {
  const failing = harness(async function* () { return { stopReason: 'error', error: { message: 'boom' } } })
  let error
  try { await failing.run() } catch (caught) { error = caught }
  check(error?.message === 'boom', `expected the fx error, got ${error?.message}`)
  const stray = harness(async function* ({ execute }) { await execute('bash', {}, 'zz'); return { stopReason: 'end_turn' } })
  error = undefined
  try { await stray.run() } catch (caught) { error = caught }
  check(/without a tool_start/.test(error?.message ?? ''), 'a stray execute is refused')
})

await test('the freddie abort signal reaches the fx prompt', async () => {
  let seen
  const h = harness(async function* ({ signal }) {
    seen = signal
    h.controller.abort(new Error('stop'))
    yield { type: 'text_delta', text: 'x' }
    return { stopReason: 'cancelled' }
  })
  await h.run()
  check(seen.aborted, 'the fx prompt signal is aborted when freddie aborts')
})

await test('splitPrompt joins trailing user messages and refuses a conversation that ends in a tool result', async () => {
  same(splitPrompt([user('a'), assistant('b'), user('c'), user('d')]).input, 'c\n\nd', 'joined input')
  let error
  try { splitPrompt([user('a'), toolResult]) } catch (caught) { error = caught }
  check(error !== undefined, 'a tool result at the end is refused')
})

await test('toFxProvider carries the route and resolves the key lazily through the credential callback', async () => {
  const asked = []
  const provider = toFxProvider({ name: 'deepseek', baseUrl: 'https://api.deepseek.com', models: ['m1'], credentialRef: 'ref' }, async ref => { asked.push(ref); return 'k' })
  same(provider.provider, { name: 'deepseek', baseUrl: 'https://api.deepseek.com', protocol: 'openai-chat-completions', models: ['m1'] }, 'provider')
  same(asked, [], 'no key read at construction')
  same(await provider.credentials(), { apiKey: 'k' }, 'credentials')
  same(asked, ['ref'], 'key read on demand')
})

console.log(`agent-fx: ${passed} cases pass`)
