import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  isTokenDelta,
} from '@freddie/freddie-llm/message'
import { CallId } from '@freddie/freddie-llm/brand'
import { deriveEventMessage, foldSurface } from '@freddie/freddie-session/surface'
import { AbstractApiClient, RpcId, SESSION_SEARCH_RESULT_LIMIT } from './api.js'
import { randomUuid } from './random-uuid.js'

const FIXTURE_CONTEXT_WINDOW = 128_000

const MULTI_HUNK_EDIT_PATH = 'src/config.ts'

const NO_VIEW = undefined

function rpcRequest(payload) {
  return { rpcId: RpcId(randomUuid()), payload }
}

function text(t) {
  return [{ type: 'text', text: t }]
}

function userMessage(content, source = { kind: 'user' }) {
  return createUserMessage({ content, source })
}

function assistantMessage(content, model = 'fx-1') {
  return createAssistantMessage({
    content,
    source: { provider: 'fixture', model },
  })
}

function toolResultMessage(callId, content, isError) {
  return createToolResultMessage({ callId: CallId(callId), content, isError })
}

const MARKDOWN_FIXTURE = [
  '# Markdown fixture',
  '',
  'Assistant output renders **strong text**, *emphasis*, and `inline code`.',
  '',
  '- first item',
  '  - nested item',
  '',
  '| Area | State |',
  '| --- | --- |',
  '| history | rendered |',
  '| streaming | stable |',
  '',
  '[DeepSeek](https://www.deepseek.com)',
  '',
  '```ts',
  'const markdown = true',
  '```',
].join('\n')

const USER_MARKDOWN_LITERAL = 'User literal: # not rendered `code` [link](https://example.com)'

function sgr(code, body) {
  return `[${code}m${body}[0m`
}

const TERMINAL_OUTPUT_FIXTURE = [
  sgr(1, 'Running 4 checks'),
  `${sgr(32, '✓')} typecheck                                          1.82s`,
  `${sgr(32, '✓')} lint                                               0.94s`,
  `${sgr(32, '✓')} duplication                                        2.10s`,
  `${sgr(31, '✗')} unit                                               8.41s`,
  '',
  sgr(90, 'packages/client/ui-primitives/tests/terminal-block.client.spec.tsx'),
  `  ${sgr(31, 'FAIL')} caps output at the configured line budget`,
  '    expected 16 lines, received 24',
  '',
  'NAME                        LINES    BRANCHES    FUNCTIONS    UNCOVERED',
  'TerminalBlock.tsx           100%     100%        100%         -',
  'ansi.ts                     100%     100%        100%         -',
  'clipboard.ts                100%     100%        100%         -',
  'CodeBlock.tsx               98.4%    96.2%       100%         41-43',
  'highlight.ts                100%     100%        100%         -',
  'Pill.tsx                    100%     100%        100%         -',
  'StateDot.tsx                100%     100%        100%         -',
  'markdown/Markdown.tsx       100%     100%        100%         -',
  '',
  sgr(31, '1 of 4 checks failed'),
].join('\n')

const TERMINAL_EXIT_STATUS = {
  [TERMINAL_OUTPUT_FIXTURE]: { exitCode: 1 },
}

const SEARCH_MATCHES_FIXTURE = [
  {
    path: 'packages/client/ui-primitives/src/SearchBlock.tsx',
    matches: [
      { lineNumber: 16, line: 'export const DEFAULT_SEARCH_MAX_LINES = 16' },
      { lineNumber: 138, line: 'export function SearchBlock(props: SearchBlockProps) {' },
      { lineNumber: 141, line: '  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set())' },
    ],
  },
  {
    path: 'packages/client/ui-tool/src/client/tool/models/search-card-model.ts',
    matches: [
      { lineNumber: 45, line: 'export const CHAT_SEARCH_MAX_LINES = 8' },
      { lineNumber: 130, line: 'export function searchCardModel(block: ToolCallBlock): SearchCardModel | null {' },
    ],
  },
  {
    path: 'packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx',
    matches: [
      { lineNumber: 34, line: 'export function SearchRow({ toolName, block, inspect, t }: SearchRowProps) {' },
      { lineNumber: 36, line: '  const search = searchCardModel(block)' },
      { lineNumber: 56, line: '      search={search}' },
      { lineNumber: 78, line: "      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'grep', locale: NS }, SearchRow)" },
    ],
  },
]

const SEARCH_MATCHES_TEXT = [
  'Found 9 of 42 matches',
  '',
  ...SEARCH_MATCHES_FIXTURE.map(file =>
    [file.path, ...file.matches.map(m => `Line ${m.lineNumber}: ${m.line}`)].join('\n')),
  '',
  '(Full grep result stored at: fixture://spill/grep-66. Read it to see every match.)',
].join('\n')

const SEARCH_PATHS_FIXTURE = [
  'packages/client/ui-primitives/src/SearchBlock.tsx',
  'packages/client/ui-primitives/src/SearchBlock.module.css',
  'packages/client/ui-tool/src/client/tool/models/search-card-model.ts',
  'packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx',
  'packages/client/ui-tool/tests/search-card.client.spec.tsx',
]

const SEARCH_PATHS_TEXT = [
  ...SEARCH_PATHS_FIXTURE,
  '',
  '(Showing 5 of 23 paths. Full sorted result stored at: fixture://spill/glob-67. Read it to see every path.)',
].join('\n')

const READ_SAMPLE_FIRST_LINE = 41
const READ_SAMPLE_SOURCE = [
  'export interface ReadBlockProps {',
  '  label?: string | undefined',
  '  lines: readonly ReadBlockLine[]',
  '  totalLines: number',
  '  lang?: string | undefined',
  '  maxLines?: number | undefined',
  '  className?: string | undefined',
  '}',
  '',
  '// A windowed read keeps the file line numbers in the gutter.',
  'const marker = "fixture read sample"',
]
const READ_SAMPLE_LINES = READ_SAMPLE_SOURCE.map((text, index) => ({ number: READ_SAMPLE_FIRST_LINE + index, text }))
const READ_SAMPLE_PATH = 'packages/client/ui-primitives/src/ReadBlock.tsx'
const READ_SAMPLE_TOTAL = 180
const READ_SAMPLE_TEXT = READ_SAMPLE_SOURCE.map((text, index) => `${READ_SAMPLE_FIRST_LINE + index}: ${text}`).join('\n')

const WEB_SEARCH_RESULT = {
  answer: 'Freddie is a plugin-based agent harness on vendored Cordis where **every capability is a plugin**.',
  sources: [
    {
      url: 'https://github.com/lanmower/freddie',
      title: 'Freddie — plugin-based agent harness',
      snippet: 'Everything is a plugin: session, tools, agent-loop, and LLM adapters all mount on the same Cordis context.',
      publishedAt: '2026-07-01',
    },
    {
      url: 'https://www.deepseek.com/blog/harness-architecture',
      snippet: 'The capability-seam pattern splits each capability into interface, implementation, and consumer packages.',
    },
    {
      url: 'https://docs.deepseek.com/harness/plugins',
      title: 'Writing a harness plugin',
      publishedAt: '2026-06-15',
    },
  ],
  truncated: true,
}

const WEB_FETCH_RESULT = {
  url: 'https://www.deepseek.com/blog/harness-architecture',
  statusCode: 200,
  truncated: false,
}

const DEEPSEEK_REASONING = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max' },
  ],
  defaultEffort: 'high',
}

const OPENAI_REASONING = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'medium', name: 'Medium' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max' },
  ],
  defaultEffort: 'medium',
}

function fixtureModelGroups() {
  return [
    {
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek-V4-Flash',
          description: 'Fast responses',
          reasoning: DEEPSEEK_REASONING,
        },
        {
          id: 'deepseek-v4-pro',
          name: 'DeepSeek-V4-Pro',
          description: 'Complex tasks',
          reasoning: DEEPSEEK_REASONING,
        },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      models: [{ id: 'gpt-5', name: 'GPT-5', reasoning: OPENAI_REASONING }],
    },
  ]
}

function sid(id) {
  return id
}

const FIXTURE_IMAGE_DATA = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA/xl1SAAAAvklEQVR42u3SMQ0AAAjAMIyhELM4AAe8PD1qYFlk9cCXEAEDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGxIBCYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIAYEAyIAcGAGBAMiAHBgBgQDIgBwYAYEAyIAcGAGBAMiAHBgBgQDIgB4bYWLb6pnOb1xAAAAABJRU5ErkJggg=='
const FIXTURE_IMAGE_REF = {
  attachmentId: 'fixture:image',
  mediaType: 'image/png',
  bytes: 247,
  width: 160,
  height: 90,
  name: 'fixture-image.png',
}

function fixtureUsage(turn, step) {
  return {
    inputTokens: 20 + turn % 5,
    outputTokens: 8 + step,
    cacheReadTokens: turn === 0 ? 0 : 80,
    cacheWriteTokens: turn % 10 === 0 ? 4 : 0,
  }
}

function buildAlphaLog() {
  const events = []
  let time = Date.now() - 3_600_000
  const push = (e) => {
    const seq = events.length
    const data = e['data']
    const authored = e['type'] === 'assistant/message' && data !== undefined
      ? {
        ...e,
        data: {
          ...data,
          usage: fixtureUsage(data['turn'], data['step']),
        },
      }
      : e
    events.push({ seq, time: (time += 800), ...authored })
    return seq
  }
  push({
    type: 'request/context',
    data: { provider: 'deepseek-official', model: 'deepseek-v4-flash', contextWindow: FIXTURE_CONTEXT_WINDOW },
  })
  for (let turn = 0; turn < 60; turn++) {
    push({ type: 'turn/start', data: { turn } })
    const userSeq = push({
      type: 'user/message', surfaceOp: 'append',
      data: userMessage(text(turn === 59 ? USER_MARKDOWN_LITERAL : `Question ${turn}: fixture history message for pagination and render acceptance.`)),
    })
    if (turn === 0) {
      push({
        type: 'session/title',
        data: { title: 'Fixture history session', messageSeqs: [userSeq], source: { kind: 'fallback' } },
      })
    }
    if (turn % 9 === 4) {
      push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text(`[fixture] Context injection (turn ${turn})`), { kind: 'plugin', plugin: 'fixture' }) })
    }
    push({ type: 'step/start', data: { turn, step: 0 } })
    const withTool = turn % 5 === 2
    const withReasoning = turn % 3 === 1
    const blocks = []
    if (withReasoning) blocks.push({ type: 'reasoning', text: `Reasoning ${turn}: this is a collapsible block of reasoning content.` })
    blocks.push({ type: 'text', text: turn === 59 ? MARKDOWN_FIXTURE : `Answer ${turn}: this is fixture-generated history reply text.` })
    if (withTool) {
      const callId = `fx-call-${turn}`
      blocks.push({ type: 'tool-call', id: callId, name: 'echo', arguments: `{"text":"turn ${turn}"}` })
      push({ type: 'assistant/message', surfaceOp: 'append', data: { turn, step: 0, message: assistantMessage(blocks) } })
      push({ type: 'tool/call', data: { turn, step: 0, callId, name: 'echo', arguments: `{"text":"turn ${turn}"}` } })
      push({ type: 'tool/result', surfaceOp: 'append', data: { turn, step: 0, message: toolResultMessage(callId, text(`ECHO: TURN ${turn}`), turn % 25 === 12) } })
      push({ type: 'step/end', data: { turn, step: 0 } })
      push({ type: 'step/start', data: { turn, step: 1 } })
      push({ type: 'assistant/message', surfaceOp: 'append', data: { turn, step: 1, message: assistantMessage(text(`Tool result digested (turn ${turn}).`)) } })
      push({ type: 'step/end', data: { turn, step: 1 } })
    } else {
      push({ type: 'assistant/message', surfaceOp: 'append', data: { turn, step: 0, message: assistantMessage(blocks) } })
      push({ type: 'step/end', data: { turn, step: 0 } })
    }
    push({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
  }
  const toolTurn = (turn, name, args, resultText) => {
    const callId = `fx-call-${turn}`
    push({ type: 'turn/start', data: { turn } })
    push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text(`Question ${turn}: ${name} sample.`)) })
    push({ type: 'step/start', data: { turn, step: 0 } })
    push({
      type: 'assistant/message', surfaceOp: 'append',
      data: { turn, step: 0, message: assistantMessage([{ type: 'tool-call', id: callId, name, arguments: args }]) },
    })
    push({ type: 'tool/call', data: { turn, step: 0, callId, name, arguments: args } })
    push({ type: 'tool/result', surfaceOp: 'append', data: { turn, step: 0, message: toolResultMessage(callId, text(resultText), false) } })
    push({ type: 'step/end', data: { turn, step: 0 } })
    push({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
  }
  const SAMPLE_TURN = Object.freeze({
    twoLineTerminalFallbackRow: 60,
    fallbackWrite: 61,
    singleHunkEdit: 62,
    newFileWrite: 63,
    multiHunkEdit: 64,
    codeModeSubDispatches: 65,
    richTerminal: 66,
    grepMatches: 67,
    globPaths: 68,
    readWindow: 69,
    webSearch: 70,
    webFetch: 71,
    maxTokens: 72,
    images: 73,
    todo: 74,
  })
  toolTurn(SAMPLE_TURN.twoLineTerminalFallbackRow, 'fx-bash', '{"command":"ls -la\\necho done","cwd":"/tmp/fixture"}', 'total 2\ndrwxr-xr-x fixture\n-rw-r--r-- demo.txt')
  toolTurn(SAMPLE_TURN.fallbackWrite, 'fx-write', '{"path":"notes/demo.txt","content":"hello fixture\\n"}', 'wrote notes/demo.txt')
  toolTurn(SAMPLE_TURN.singleHunkEdit, 'edit', '{"file_path":"notes/demo.txt","old_string":"hello","new_string":"hello fixture"}', 'Edited')
  toolTurn(SAMPLE_TURN.newFileWrite, 'write', '{"file_path":"notes/new-demo.txt","content":"hello fixture\\n"}', 'Written')
  toolTurn(
    SAMPLE_TURN.multiHunkEdit,
    'edit',
    JSON.stringify({ file_path: MULTI_HUNK_EDIT_PATH, old_string: 'const timeout = 30', new_string: 'const timeout = 60' }),
    'Edited',
  )
  {
    const turn = SAMPLE_TURN.codeModeSubDispatches
    const callId = `fx-call-${turn}`
    const program = 'const listing = await tools.bash({ command: "ls notes", description: "List notes" })\n'
      + 'const demo = await tools.read({ file_path: "notes/demo.txt" })\n'
      + 'await tools.read({ file_path: "notes/missing.txt" }).catch(() => "tolerated")\n'
      + 'return { listing, demo }'
    const args = JSON.stringify({ code: program, description: 'Read the notes files and summarize' })
    push({ type: 'turn/start', data: { turn } })
    push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text(`Question ${turn}: run_code sample.`)) })
    push({ type: 'step/start', data: { turn, step: 0 } })
    push({
      type: 'assistant/message', surfaceOp: 'append',
      data: { turn, step: 0, message: assistantMessage([{ type: 'tool-call', id: callId, name: 'run_code', arguments: args }]) },
    })
    push({ type: 'tool/call', data: { turn, step: 0, callId, name: 'run_code', arguments: args } })
    const dispatchPair = (n, name, dispatchArgs, resultText, isError = false) => {
      push({
        type: 'tool/code-dispatch-start',
        data: { rootCallId: callId, parentCallId: callId, subCallId: `${callId}:code:${n}`, name, arguments: dispatchArgs },
      })
      push({
        type: 'tool/code-dispatch',
        data: {
          rootCallId: callId, parentCallId: callId, subCallId: `${callId}:code:${n}`, name,
          arguments: dispatchArgs, isError, content: [{ type: 'text', text: resultText }],
        },
      })
    }
    dispatchPair(1, 'bash', { command: 'ls notes', description: 'List notes' }, 'demo.txt\nnew-demo.txt')
    dispatchPair(2, 'read', { file_path: 'notes/demo.txt' }, 'hello fixture\n')
    dispatchPair(3, 'read', { file_path: 'notes/missing.txt' }, 'Error: ENOENT: notes/missing.txt not found', true)
    push({
      type: 'tool/result', surfaceOp: 'append',
      data: { turn, step: 0, message: toolResultMessage(callId, text('{"listing":"demo.txt\\nnew-demo.txt","demo":"hello fixture\\n"}'), false) },
    })
    push({ type: 'step/end', data: { turn, step: 0 } })
    push({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
  }
  const parallelPlanTodos = [
    { content: 'Gather requirements', status: 'completed' },
    { content: 'Implement fixture samples', status: 'in_progress' },
    { content: 'Run background build', status: 'in_progress' },
    { content: 'Browser acceptance', status: 'pending' },
  ]
  toolTurn(SAMPLE_TURN.richTerminal, 'bash', '{"command":"pnpm run check","cwd":"/tmp/fixture/deep/nested"}', TERMINAL_OUTPUT_FIXTURE)

  toolTurn(SAMPLE_TURN.grepMatches, 'grep', '{"pattern":"SEARCH_MAX_LINES","path":"packages/client"}', SEARCH_MATCHES_TEXT)
  toolTurn(SAMPLE_TURN.globPaths, 'glob', '{"pattern":"**/SearchBlock*","path":"packages/client"}', SEARCH_PATHS_TEXT)

  toolTurn(SAMPLE_TURN.readWindow, 'read', `{"file_path":${JSON.stringify(READ_SAMPLE_PATH)},"offset":${READ_SAMPLE_FIRST_LINE}}`, READ_SAMPLE_TEXT)

  toolTurn(SAMPLE_TURN.webSearch, 'web_search', '{"queries":["deepseek harness architecture"]}', 'Search results for deepseek harness architecture.')
  toolTurn(SAMPLE_TURN.webFetch, 'web_fetch', '{"url":"https://www.deepseek.com/blog/harness-architecture"}', '# Harness architecture\n\nEverything is a plugin.')

  {
    const turn = SAMPLE_TURN.maxTokens
    push({ type: 'turn/start', data: { turn } })
    push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text('Question 72: please list all one hundred items in full.')) })
    push({ type: 'step/start', data: { turn, step: 0 } })
    push({
      type: 'assistant/message',
      surfaceOp: 'append',
      data: { turn, step: 0, message: assistantMessage(text('Item 1: the first. Item 2: the second. Item 3: this one is cut off halfway and')) },
    })
    push({ type: 'step/end', data: { turn, step: 0 } })
    push({ type: 'turn/end', data: { turn, reason: { kind: 'max-tokens' } } })
  }

  {
    const turn = SAMPLE_TURN.images
    push({ type: 'turn/start', data: { turn } })
    push({
      type: 'user/message',
      surfaceOp: 'append',
      data: userMessage([{ type: 'image', attachment: FIXTURE_IMAGE_REF }, ...text('Historical user image')]),
    })
    push({ type: 'step/start', data: { turn, step: 0 } })
    push({
      type: 'assistant/message',
      surfaceOp: 'append',
      data: {
        turn,
        step: 0,
        message: assistantMessage(
          [...text('Structured model image: '), { type: 'image', attachment: FIXTURE_IMAGE_REF }],
          'fx-vision',
        ),
      },
    })
    push({ type: 'step/end', data: { turn, step: 0 } })
    push({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
  }

  const todoArgs = JSON.stringify({ todos: parallelPlanTodos })
  toolTurn(SAMPLE_TURN.todo, 'todo_write', todoArgs, 'Updated todo list: 1 pending, 2 in progress, 1 completed.')
  const TOOL_TURN_TAIL_FROM_CALL = ['tool/call', 'tool/result', 'step/end', 'turn/end'].length
  const callIndex = events.length - TOOL_TURN_TAIL_FROM_CALL
  const callTime = events[callIndex]?.time
  events.splice(callIndex + 1, 0, { type: 'todo/write', time: callTime + 400, data: { todos: parallelPlanTodos } })
  events.forEach((e, i) => { e.seq = i })
  return events
}

/* v8 ignore next */
const str = (value, fallback = '') => typeof value === 'string' ? value : fallback

function presentCall(name, argsRaw) {
  let args
  try {
    args = JSON.parse(argsRaw)
  } catch {
    /* v8 ignore next 2 */
    return undefined
  }
  switch (name) {
    case 'fx-bash':
    case 'bash':
      return { card: 'terminal', title: str(args.command), cwd: str(args.cwd, '/tmp/fixture'), description: 'fixture terminal sample' }
    case 'fx-write':
      return {
        card: 'diff', title: `Write ${str(args.path)}`,
        diffs: [{ path: str(args.path), oldText: null, newText: str(args.content) }],
      }
    case 'read':
      return { card: 'generic', title: `Read ${str(args.file_path)}`, kind: 'read', locations: [{ path: str(args.file_path) }] }
    case 'edit':
      if (str(args.file_path) === MULTI_HUNK_EDIT_PATH) {
        return {
          card: 'diff', title: `Edit ${str(args.file_path)}`,
          diffs: [
            { path: str(args.file_path), oldText: 'const timeout = 30', newText: 'const timeout = 60' },
            { path: str(args.file_path), oldText: 'retries: 1', newText: 'retries: 3' },
          ],
        }
      }
      return {
        card: 'diff', title: `Edit ${str(args.file_path)}`,
        diffs: [{ path: str(args.file_path), oldText: str(args.old_string), newText: str(args.new_string) }],
      }
    case 'write':
      return {
        card: 'diff', title: `Write ${str(args.file_path)}`,
        diffs: [{ path: str(args.file_path), oldText: null, newText: str(args.content) }],
      }
    case 'grep':
      return { card: 'generic', title: `Grep ${str(args.pattern)}`, kind: 'search', rawInput: args }
    case 'glob':
      return { card: 'generic', title: `Glob ${str(args.pattern)}`, kind: 'search', rawInput: args }
    case 'web_search': {
      const queries = Array.isArray(args.queries) ? args.queries.filter((query) => typeof query === 'string' && query !== '') : []
      const title = queries.join(', ')
      return { card: 'generic', title: `Search ${title}`, kind: 'search', rawInput: args }
    }
    case 'web_fetch':
      return { card: 'generic', title: `Fetch ${str(args.url)}`, kind: 'fetch', rawInput: args }
    default:
      return NO_VIEW
  }
}

function presentResult(name, argsRaw, resultText) {
  const call = presentCall(name, argsRaw)
  if (call === undefined) return undefined
  if (name === 'grep') {
    return { card: 'search', shape: 'matches', files: SEARCH_MATCHES_FIXTURE, truncated: true, total: 42 }
  }
  if (name === 'glob') {
    return { card: 'search', shape: 'paths', paths: SEARCH_PATHS_FIXTURE, truncated: true, total: 23 }
  }
  if (name === 'read') {
    return {
      card: 'read', path: READ_SAMPLE_PATH, offset: READ_SAMPLE_FIRST_LINE, lines: READ_SAMPLE_LINES,
      totalLines: READ_SAMPLE_TOTAL, lang: 'ts', content: text(resultText),
    }
  }
  if (name === 'web_search') {
    return { card: 'web', kind: 'search', ...WEB_SEARCH_RESULT }
  }
  if (name === 'web_fetch') {
    return { card: 'web', kind: 'fetch', ...WEB_FETCH_RESULT }
  }
  switch (call.card) {
    case 'terminal':
      return { card: 'terminal', output: resultText, ...(TERMINAL_EXIT_STATUS[resultText] ?? { exitCode: 0 }) }
    case 'diff':
      return { card: 'diff', diffs: call.diffs }
    case 'generic':
      return { card: 'generic', content: text(resultText) }
  }
}

function splitCommandLine(line) {
  const match = /^\/(\S+)((?:\s.*)?)$/.exec(line.trim())
  return { name: match?.[1], args: match?.[2] ?? '' }
}

function viewFor(event, log) {
  if (event.type === 'tool/call') {
    const view = presentCall(event.data.name, event.data.arguments)
    return view === undefined ? undefined : { for: 'call', view }
  }
  if (event.type === 'tool/result') {
    const callId = String(event.data.message.source.callId)
    for (let i = log.length - 1; i >= 0; i--) {
      const candidate = log[i]
      /* v8 ignore next */
      if (candidate !== undefined && candidate.type === 'tool/call' && String(candidate.data.callId) === callId) {
        const resultText = event.data.message.content[0].content.map(b => (b.type === 'text' ? b.text : '')).join('')
        const view = presentResult(candidate.data.name, candidate.data.arguments, resultText)
        return view === undefined ? undefined : { for: 'result', view }
      }
    }
    return NO_VIEW
  }
  return undefined
}

function foldPlan(log) {
  let active = false
  let wanted = null
  let running = null
  for (const event of log) {
    const item = event
    if (item.type === 'command/run' && item.data?.['name'] === 'plan') {
      const args = item.data['args']
      if (typeof args !== 'string') continue
      running = { commandId: item.data['commandId'], wanted: args.trim() !== 'off' }
    } else if (item.type === 'command/done'
      && item.data !== undefined
      && running !== null
      && item.data['commandId'] === running.commandId) {
      wanted = item.data['kind'] === 'success' && running.wanted !== active ? running.wanted : null
      running = null
    } else if (item.type === 'plan/mode') {
      active = item.data?.['active'] === true
      wanted = null
    }
  }
  const selected = running?.wanted ?? wanted
  return { active, pending: selected !== null && selected !== active, wanted: selected }
}

function planViewOf(log) {
  const plan = foldPlan(log)
  return { active: plan.active, pending: plan.pending }
}

const PERMISSION_PRESETS = {
  'workspace-write': { sandbox: 'workspace-write', approval: 'ask', description: 'Write inside the workspace and permitted temporary directories; wider retries require approval.' },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', description: 'Full file access without approval prompts.' },
}

function permissionSelectOf(
  log,
) {
  let preset = null
  let sandbox = 'workspace-write'
  let approval = 'ask'
  for (const event of log) {
    const item = event
    if (item.type === 'permission/preset') preset = item.data['preset']
    else if (item.type === 'sandbox/mode') sandbox = item.data['mode']
    else if (item.type === 'approval/policy') approval = item.data['policy']
  }
  const matches = (spec) => spec.sandbox === sandbox && spec.approval === approval
  let currentValue = 'custom'
  const folded = preset === null ? undefined : PERMISSION_PRESETS[preset]
  if (preset !== null && folded !== undefined && matches(folded)) {
    currentValue = preset
  } else {
    for (const [name, spec] of Object.entries(PERMISSION_PRESETS)) {
      if (matches(spec)) { currentValue = name; break }
    }
  }
  return {
    options: [
      ...Object.entries(PERMISSION_PRESETS).map(([value, spec]) => ({ value, name: value, description: spec.description })),
      ...currentValue === 'custom' ? [{ value: 'custom', name: 'Custom', description: 'Current sandbox and approval settings do not match a preset.' }] : [],
    ],
    currentValue,
  }
}

function usageSampleOf(event) {
  const item = event
  const usage = item.type === 'assistant/chunk' && item.data.chunk?.type === 'usage'
    ? item.data.chunk.usage
    : item.type === 'assistant/message'
      ? item.data.usage
      : undefined
  return usage === undefined || item.data.turn === undefined || item.data.step === undefined
    ? undefined
    : { turn: item.data.turn, step: item.data.step, usage }
}

function tokenUsageOf(log) {
  const totals = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
  let last = null
  for (const event of log) {
    const sample = usageSampleOf(event)
    if (sample === undefined) continue
    const buckets = {
      uncachedInputTokens: sample.usage.inputTokens,
      outputTokens: sample.usage.outputTokens,
      cacheReadTokens: sample.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: sample.usage.cacheWriteTokens ?? 0,
    }
    const previous = last?.turn === sample.turn && last.step === sample.step
      ? last.buckets
      : undefined
    totals.uncachedInputTokens += buckets.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0)
    totals.outputTokens += buckets.outputTokens - (previous?.outputTokens ?? 0)
    totals.cacheReadTokens += buckets.cacheReadTokens - (previous?.cacheReadTokens ?? 0)
    totals.cacheWriteTokens += buckets.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0)
    last = { turn: sample.turn, step: sample.step, buckets }
  }
  return totals
}

function sessionStatsOf(log) {
  const value = { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }
  let lastTurn = null
  let openStep = null
  const pendingCalls = new Map()
  for (const event of log) {
    switch (event.type) {
      case 'step/start':
        openStep = { turn: event.data.turn, step: event.data.step, startTime: event.time, firstTokenTime: null }
        break
      case 'assistant/chunk':
        if (openStep !== null && openStep.turn === event.data.turn && openStep.step === event.data.step
          && openStep.firstTokenTime === null && isTokenDelta(event.data.chunk)) {
          openStep.firstTokenTime = event.time
        }
        break
      case 'assistant/message': {
        if (openStep === null || openStep.turn !== event.data.turn || openStep.step !== event.data.step) break
        value.llmMs += Math.max(0, event.time - openStep.startTime)
        if (openStep.firstTokenTime !== null) {
          value.ttftMs += Math.max(0, openStep.firstTokenTime - openStep.startTime)
          value.ttftSteps += 1
          const outputTokens = event.data.usage?.outputTokens
          if (typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens >= 0) {
            value.decodeMs += Math.max(0, event.time - openStep.firstTokenTime)
            value.decodeTokens += outputTokens
          }
        }
        openStep = null
        break
      }
      case 'tool/call':
        pendingCalls.set(event.data.callId, event.time)
        break
      case 'tool/result': {
        const callId = event.data.message.source.callId
        const dispatched = pendingCalls.get(callId)
        if (dispatched === undefined) break
        pendingCalls.delete(callId)
        value.toolMs += Math.max(0, event.time - dispatched)
        break
      }
      case 'step/end':
        if (event.data.turn !== lastTurn) {
          value.turns += 1
          lastTurn = event.data.turn
        }
        value.steps += 1
        openStep = null
        break
      case 'turn/end':
        pendingCalls.clear()
        break
      default:
        break
    }
  }
  return value
}

const CHARS_PER_TOKEN = 4
const BLOCK_OVERHEAD = 4
const ROLE_OVERHEAD = 4

function estimateFixtureContent(blocks) {
  const densityPrice = (value) => Math.ceil(value.length / CHARS_PER_TOKEN)
  const structuralJsonPrice = (block) => densityPrice(JSON.stringify(block))
  return blocks.reduce((tokens, block) => {
    if (block.type === 'text' || block.type === 'reasoning') {
      return tokens + densityPrice(block.text) + BLOCK_OVERHEAD
    }
    if (block.type === 'tool-call') {
      return tokens + densityPrice(block.name) + densityPrice(block.arguments) + BLOCK_OVERHEAD
    }
    if (block.type === 'tool-result') {
      return tokens + estimateFixtureContent(block.content) + BLOCK_OVERHEAD
    }
    return tokens + structuralJsonPrice(block) + BLOCK_OVERHEAD
  }, 0)
}

function contextBreakdownOf(log) {
  const headerEvent = log.findLast(event => event.type === 'request/header')
  const header = headerEvent === undefined
    ? undefined
    : headerEvent.data.header
  let messageTokens = 0
  for (const seq of foldSurface(log).nodes) {
    const event = log[seq]
    if (event === undefined) continue
    const message = deriveEventMessage(event)
    if (message !== null) messageTokens += estimateFixtureContent(message.content) + ROLE_OVERHEAD
  }
  return {
    systemTokens: header?.system === undefined
      ? 0
      : Math.ceil(header.system.length / CHARS_PER_TOKEN) + ROLE_OVERHEAD,
    toolsTokens: header?.tools === undefined || header.tools.length === 0
      ? 0
      : Math.ceil(JSON.stringify(header.tools).length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD,
    messageTokens,
  }
}

function lastRequestContext(
  log,
) {
  const event = log.findLast(item => item.type === 'request/context')
  return event === undefined
    ? undefined
    : event.data
}

function contextPressureOf(
  log,
) {
  let pressureTokens
  for (const event of log) {
    const sample = usageSampleOf(event)
    if (sample === undefined) continue
    pressureTokens = sample.usage.inputTokens
      + (sample.usage.cacheReadTokens ?? 0)
      + (sample.usage.cacheWriteTokens ?? 0)
  }
  const contextWindow = lastRequestContext(log)?.contextWindow
  return {
    ...pressureTokens === undefined ? {} : { pressureTokens },
    ...contextWindow === undefined ? {} : { contextWindow },
  }
}

function projectionValuesOf(log) {
  const values = {}
  const titleEvent = log.findLast(item => item.type === 'session/title')
  if (titleEvent !== undefined) {
    values['title'] = titleEvent.data.title
  }
  values['todos'] = backscanTodos(log) ?? null
  values['permissions'] = permissionSelectOf(log)
  values['plan'] = planViewOf(log)
  values['goal'] = backscanGoal(log)
  values['tokenUsage'] = tokenUsageOf(log)
  values['contextPressure'] = contextPressureOf(log)
  values['contextBreakdown'] = contextBreakdownOf(log)
  values['sessionStats'] = sessionStatsOf(log)
  values['imageLimits'] = {
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    maxImageDimension: 2000,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  }
  return values
}

function projectionFramesOf(id, log, event) {
  const type = event.type
  const frames = []
  const advancesBothTokenMeterUnits = usageSampleOf(event) !== undefined
  if (advancesBothTokenMeterUnits) {
    frames.push(
      { type: 'session/projection', sessionId: id, key: 'tokenUsage', value: tokenUsageOf(log), seq: event.seq },
      { type: 'session/projection', sessionId: id, key: 'contextPressure', value: contextPressureOf(log), seq: event.seq },
    )
  }
  if (type === 'request/context') {
    frames.push({
      type: 'session/projection',
      sessionId: id,
      key: 'contextPressure',
      value: contextPressureOf(log),
      seq: event.seq,
    })
  }
  if (type === 'request/header'
    || type === 'user/message'
    || type === 'assistant/message'
    || type === 'tool/result') {
    frames.push({
      type: 'session/projection',
      sessionId: id,
      key: 'contextBreakdown',
      value: contextBreakdownOf(log),
      seq: event.seq,
    })
  }
  const advancesStatsFold = type === 'assistant/message' || type === 'tool/result' || type === 'step/end'
  if (advancesStatsFold) {
    frames.push({
      type: 'session/projection',
      sessionId: id,
      key: 'sessionStats',
      value: sessionStatsOf(log),
      seq: event.seq,
    })
  }
  if (frames.length > 0) return frames
  if (type === 'session/title') {
    const values = projectionValuesOf(log)
    /* v8 ignore next */
    if (!Object.hasOwn(values, 'title')) return []
    return [{ type: 'session/projection', sessionId: id, key: 'title', value: values['title'], seq: event.seq }]
  }
  if (type === 'goal/change') {
    return [{ type: 'session/projection', sessionId: id, key: 'goal', value: backscanGoal(log), seq: event.seq }]
  }
  const writesOrRetiresStandingPlan = type === 'todo/write' || type === 'turn/start'
  if (writesOrRetiresStandingPlan) {
    return [{
      type: 'session/projection',
      sessionId: id,
      key: 'todos',
      value: backscanTodos(log) ?? null,
      seq: event.seq,
    }]
  }
  const isWholeValueKnobEvent = type === 'permission/preset' || type === 'sandbox/mode' || type === 'approval/policy'
  if (isWholeValueKnobEvent) {
    return [{
      type: 'session/projection',
      sessionId: id,
      key: 'permissions',
      value: permissionSelectOf(log),
      seq: event.seq,
    }]
  }
  const commandData = event
  const advancesPlanUnit = type === 'plan/mode' || (type === 'command/run'
    && commandData.data.name === 'plan' && typeof commandData.data.args === 'string')
  if (advancesPlanUnit) {
    return [{
      type: 'session/projection',
      sessionId: id,
      key: 'plan',
      value: planViewOf(log),
      seq: event.seq,
    }]
  }
  return []
}

function pageOf(
  log,
  beforeSeq,
  maxMessages,
) {
  const end = beforeSeq === undefined ? log.length : Math.max(0, Math.min(beforeSeq, log.length))
  let start = 0
  let messages = 0
  for (let i = end - 1; i >= 0; i--) {
    const event = log[i]
    /* v8 ignore next */
    if (event === undefined) break
    if (event.type === 'user/message' || event.type === 'assistant/message') messages++
    if (event.type === 'turn/start' && messages >= maxMessages) {
      start = i
      break
    }
  }
  const events = log.slice(start, end).map((event) => {
    const view = viewFor(event, log)
    return view === undefined ? { event } : { event, view }
  })
  return { events, hasMore: start > 0 }
}

function logReferencesAttachment(log, attachmentId) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.some(visit)
    if (typeof value !== 'object' || value === null) return false
    const record = value
    if (record.attachmentId === attachmentId) return true
    return Object.values(record).some(visit)
  }
  return log.some(event => visit(event.data))
}

function searchBlockText(block) {
  switch (block.type) {
    case 'text':
      return [block.text]
    case 'reasoning':
      return []
    case 'tool-call':
      return [block.name, block.arguments]
    case 'tool-result':
      return block.content.flatMap(searchBlockText)
    default:
      return []
  }
}

function searchEventText(event) {
  const content = event.type === 'user/message'
    ? event.data.content
    : event.type === 'assistant/message'
      ? event.data.message.content
      : undefined
  if (content === undefined) return ''
  return content.flatMap(searchBlockText).map(part => part.trim()).filter(Boolean).join('\n')
}

function searchTokenSpans(value) {
  const text = value.replace(/\s+/gu, ' ').trim()
  const characters = Array.from(text)
  const tokens = []
  let start
  let raw = ''
  const flush = (end) => {
    if (start !== undefined) {
      const folded = raw.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
      if (folded !== '') tokens.push({ value: folded, start, end })
    }
    start = undefined
    raw = ''
  }
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]
    const tokenBase = character.normalize('NFD').replace(/\p{M}+/gu, '')
    if (tokenBase === '') {
      if (start !== undefined) raw += character
      continue
    }
    if (/^[\p{L}\p{N}\p{Co}]+$/u.test(tokenBase)) {
      start ??= index
      raw += character
    } else {
      flush(index)
    }
  }
  flush(characters.length)
  return { text, tokens }
}

function phraseMatch(document, phrase) {
  if (phrase.length === 0 || phrase.length > document.length) return { count: 0, start: 0, end: 0 }
  let count = 0
  let firstStart = 0
  let firstEnd = 0
  for (let start = 0; start <= document.length - phrase.length; start++) {
    if (!phrase.every((token, offset) => document[start + offset]?.value === token)) continue
    count++
    if (count === 1) {
      firstStart = document[start]?.start ?? 0
      firstEnd = document[start + phrase.length - 1]?.end ?? firstStart
    }
  }
  return { count, start: firstStart, end: firstEnd }
}

function searchSnippet(value, matchStart, matchEnd) {
  const characters = Array.from(value)
  if (characters.length <= 120) return value
  const boundedStart = Math.min(Math.max(0, matchStart), characters.length - 1)
  const boundedEnd = Math.min(
    characters.length,
    Math.max(boundedStart + 1, matchEnd),
  )
  const center = Math.floor((boundedStart + boundedEnd) / 2)
  let start = Math.min(
    characters.length - 118,
    Math.max(0, center - Math.floor(118 / 2)),
  )
  let end = start + 118
  if (start === 0) {
    end = 119
  } else if (end === characters.length) {
    start = characters.length - 119
  }
  return `${start > 0 ? '…' : ''}${characters.slice(start, end).join('')}${end < characters.length ? '…' : ''}`
}

function compareSearchCandidates(a, b) {
  if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount
  if (a.documentLength !== b.documentLength) return a.documentLength - b.documentLength
  if (a.time !== b.time) return b.time - a.time
  if (a.sessionId !== b.sessionId) return a.sessionId < b.sessionId ? -1 : 1
  return b.seq - a.seq
}

function backscanTodos(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const event = log[i]
    if (event === undefined) continue
    if (event.type === 'turn/start') return undefined
    if (event.type === 'todo/write') return event.data.todos
  }
  return undefined
}

function backscanGoal(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const event = log[i]
    if (event === undefined || event.type !== 'goal/change' || event.data === undefined) continue
    const change = event.data
    if (change.operation === 'clear') return null
    return { goal: change.goal, roundsStarted: change.roundsStarted, createdAt: change.createdAt, updatedAt: change.updatedAt }
  }
  return null
}

class FxInbox {
  inbox = []
  wake = null
  broken = false

  push(envelope) {
    this.inbox.push(envelope)
    this.wake?.()
  }

  breakNow() {
    this.broken = true
    this.wake?.()
  }

  isLive(signal) {
    return !signal.aborted && !this.broken
  }

  async *drain(signal) {
    const onAbort = () => this.wake?.()
    signal.addEventListener('abort', onAbort)
    try {
      while (this.isLive(signal)) {
        while (this.inbox.length > 0) yield this.inbox.shift()
        if (!this.isLive(signal)) break
        await new Promise((resolve) => {
          this.wake = resolve
        })
        this.wake = null
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export function createFixtureApi(options = {}) {
  return createFixtureWorld(options).api
}

export function createFixtureFaces(options = {}) {
  return createFixtureWorld(options)
}

function createFixtureWorld(options) {
  const sessions = options.empty ? [] : [
    { sessionId: sid('fx-alpha'), updatedAt: Date.now(), running: true, blank: false, cwd: '/tmp/fixture' },
    { sessionId: sid('fx-beta'), updatedAt: Date.now() - 60_000, running: false, blank: false, parentSessionId: sid('fx-alpha'), cwd: '/tmp/fixture' },
    { sessionId: sid('fx-gamma'), updatedAt: Date.now() - 120_000, running: false, blank: false, cwd: '/tmp/fixture' },
  ]
  const logs = new Map([[sid('fx-alpha'), buildAlphaLog()]])
  const modelSelections = new Map(sessions.map(session => [
    session.sessionId,
    { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
  ]))
  const attachments = new Map([[
    String(FIXTURE_IMAGE_REF.attachmentId),
    { attachment: FIXTURE_IMAGE_REF, data: FIXTURE_IMAGE_DATA },
  ]])
  const FIRST_RUN_READINESS_CREDENTIAL = 'DEEPSEEK_API_KEY'
  const fixtureCredentials = new Map([
    [FIRST_RUN_READINESS_CREDENTIAL, true],
  ])
  const fixturePresets = new Map([
    ['standard', { trust: 'system', content: "- id: tool-bash\n  name: '@freddie/freddie-tool-bash'\n" }],
    ['minimal', { trust: 'system', content: "- id: tool-web-search\n  name: '@freddie/freddie-tool-web-search'\n" }],
    ['my-agent', { trust: 'user', content: "- id: tool-read\n  name: '@freddie/freddie-tool-read'\n" }],
  ])
  let fixtureDefaultPreset = 'standard'
  const nextTurn = new Map([[sid('fx-alpha'), 75]])
  let nextSession = 1
  let nextRpc = 1
  let attachedSessions = options.empty ? 0 : 1
  const wid = (raw) => raw
  const fixtureEpoch = new Date(Date.now() - 300_000).toISOString()
  const FIXTURE_HOME = '/home/fixture'
  const FIXTURE_PROJECT_DIRECTORY = `${FIXTURE_HOME}/Documents/project`
  const workspaces = options.empty ? [] : [{
    workspaceId: wid('fx-ws-fixture'),
    path: '/tmp/fixture',
    title: 'fixture',
    sessionIds: [sid('fx-alpha'), sid('fx-beta'), sid('fx-gamma')],
    createdAt: fixtureEpoch,
    updatedAt: fixtureEpoch,
  }, {
    workspaceId: wid('fx-ws-home'),
    path: FIXTURE_PROJECT_DIRECTORY,
    title: 'project',
    sessionIds: [],
    createdAt: fixtureEpoch,
    updatedAt: fixtureEpoch,
  }]
  let nextWorkspace = 1
  const archivedSessionIds = []

  const directoryTree = new Map([
    ['/', ['home']],
    ['/home', ['fixture']],
    [FIXTURE_HOME, ['Documents', 'Downloads', '.config']],
    [`${FIXTURE_HOME}/Documents`, [
      'project', 'deepseek-iOS', 'deepseek-android', 'deepseek-platform',
      'deepseek-web', 'freddie', 'deepseek-app', 'deepseek-landing-blog',
    ]],
  ])
  const childrenOf = (path) => {
    const known = directoryTree.get(path)
    if (known !== undefined) return known
    const parent = path.slice(0, path.lastIndexOf('/')) || '/'
    const name = path.slice(path.lastIndexOf('/') + 1)
    return directoryTree.get(parent)?.includes(name) === true ? [] : undefined
  }
  const joinTreePath = (parent, name) => (parent === '/' ? `/${name}` : `${parent}/${name}`)
  const crumbsOf = (path) => {
    const crumbs = [{ name: '/', path: '/', hidden: false }]
    let acc = ''
    for (const segment of path.split('/').filter(Boolean)) {
      acc += `/${segment}`
      crumbs.push({ name: segment, path: acc, hidden: false })
    }
    return crumbs
  }
  const mint = () => RpcId(`fx-rpc-${nextRpc++}`)
  const pendingApprovalRpcId = mint()
  const pendingApprovalId = 'fx-approval-1'
  let approvalPending = true
  const pendingQuestionRpcId = mint()
  let questionPending = true
  const fixtureQuestions = [
    {
      id: 'harness-profile',
      header: 'Profile',
      question: 'Which kind of Agent/Harness candidate do you want to hire right now?',
      options: [
        { label: 'Engineering delivery (Recommended)', description: 'Favors people who can directly build the runtime, tool executor, sandbox, tracing, and production debugging.' },
        { label: 'Research potential', description: 'Favors agent understanding, training and evaluation thinking, and long-term growth.' },
        { label: 'Balanced', description: 'Requires both engineering ability and agent understanding, but the screening bar may be higher.' },
      ],
    },
    {
      id: 'work-mode',
      header: 'Approach',
      question: 'Which way of working should candidates show first?',
      options: [
        { label: 'Build a small prototype first (Recommended)', description: 'Validate key assumptions quickly with a working result.' },
        { label: 'Write the full design first', description: 'Settle boundaries, protocols, and risks before implementing.' },
      ],
    },
    {
      id: 'signals',
      header: 'Signals',
      question: 'Which interview signals matter most?',
      detail: 'Choose based on the current hiring goal; skipping means no preference.',
      multiSelect: true,
      options: [
        { label: 'System design' },
        { label: 'Code quality' },
        { label: 'Agent product judgment' },
      ],
    },
  ]

  const muxConns = new Set()
  const hostConns = new Set()
  const emitMux = (frame) => {
    for (const conn of muxConns) conn.push({ rpcId: mint(), payload: frame })
  }
  const emitHost = (frame) => {
    for (const conn of hostConns) conn.push({ rpcId: mint(), payload: frame })
  }

  function ok(request, value) {
    return Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value } })
  }
  function err(request, error) {
    return Promise.resolve({ rpcId: request.rpcId, result: { ok: false, error } })
  }
  const ALL_FIXTURE_ROUTES_SERVE = true
  const deterministicNativeOpen = request => ok(request, { opened: true })

  const summaryOf = (id) => sessions.find(s => s.sessionId === id)
  const requireSession = (request) => {
    if (summaryOf(request.payload.sessionId) !== undefined) return undefined
    return err(request, {
      code: 'session-not-found',
      message: `no session ${request.payload.sessionId}`,
      details: { sessionId: request.payload.sessionId },
    })
  }
  const setRunning = (id, running) => {
    const summary = summaryOf(id)
    if (summary === undefined || summary.running === running) return
    summary.running = running
    emitHost({ type: 'host/session-status', sessionId: id, running })
  }
  const logOf = (id) => {
    let log = logs.get(id)
    if (log === undefined) {
      log = []
      logs.set(id, log)
    }
    return log
  }
  const append = (id, e) => {
    const log = logOf(id)
    const event = { seq: log.length, time: Date.now(), ...e }
    log.push(event)
    const view = viewFor(event, log)
    /* v8 ignore next 3 */
    emitMux(view === undefined
      ? { type: 'session/event', sessionId: id, event }
      : { type: 'session/event', sessionId: id, event, view })
    for (const frame of projectionFramesOf(id, log, event)) emitMux(frame)
  }

  const appendGoalChange = (id, change) => {
    const log = logOf(id)
    append(id, {
      type: 'goal/change',
      data: change,
    })
    return backscanGoal(log)
  }

  const commitOutstandingPlanSelection = (id) => {
    const plan = foldPlan(logOf(id))
    if (plan.wanted !== null && plan.wanted !== plan.active) {
      append(id, { type: 'plan/mode', data: { active: plan.wanted } })
    }
  }

  const recordRouteContextOnModelChange = (id) => {
    const selection = modelSelections.get(id) ?? { provider: 'deepseek', model: 'deepseek-v4-flash' }
    if (lastRequestContext(logOf(id))?.model !== selection.model) {
      append(id, {
        type: 'request/context',
        data: { provider: selection.provider, model: selection.model, contextWindow: FIXTURE_CONTEXT_WINDOW },
      })
    }
  }

  const goalFailure = (message) => ({
    ok: false,
    error: { code: 'internal', message, details: {} },
  })

  const requireGoalSession = (id) => (
    summaryOf(id) === undefined
      ? { ok: false, error: { code: 'session-not-found', message: `no session ${id}`, details: { sessionId: id } } }
      : undefined
  )

  const commandRemotes = {
    list(id) {
      const missing = requireGoalSession(id)
      if (missing !== undefined) return missing
      return {
        ok: true,
        value: [
          { name: 'compact', description: 'fixture: compact the current session context' },
          { name: 'echo', description: 'fixture: echo the arguments', input: { hint: 'text to echo' } },
          { name: 'goal', description: 'set or view the goal for a long-running task', input: { hint: '<objective>', images: true } },
          { name: 'permission', description: 'Switch the permission preset (sandbox mode + approval policy)', input: { hint: '<preset>' } },
          { name: 'plan', description: 'Enter or leave plan mode', input: { hint: '[off|message]', images: true } },
        ],
      }
    },
    execute(id, line, images = []) {
      const missing = requireGoalSession(id)
      if (missing !== undefined) return missing
      const { name, args } = splitCommandLine(line)
      const commandsResolvedByFixture = ['permission', 'goal', 'compact', 'echo', 'plan']
      if (images.length > 0 && name !== undefined && commandsResolvedByFixture.includes(name)) {
        const rejection = name !== 'goal' && name !== 'plan'
          ? `/${name} does not accept image attachments`
          : name === 'goal' && args.trim() === ''
            ? 'Image attachments only accompany a goal objective: /goal <objective> or /goal edit <objective>.'
            : name === 'plan' && args.trim() === 'off'
              ? 'Image attachments cannot accompany /plan off.'
              : undefined
        if (rejection !== undefined) {
          const commandId = `fx-cmd-${logOf(id).length}`
          append(id, { type: 'command/run', data: { commandId, name, args, source: { kind: 'user' } } })
          const result = { kind: 'error', text: rejection }
          append(id, { type: 'command/done', data: { commandId, ...result } })
          return { ok: true, value: { commandId, result } }
        }
      }
      if (name === 'permission') {
        const preset = args.trim()
        const commandId = `fx-cmd-${logOf(id).length}`
        append(id, { type: 'command/run', data: { commandId, name, args, source: { kind: 'user' } } })
        const spec = PERMISSION_PRESETS[preset]
        let result
        if (preset === '') {
          const current = permissionSelectOf(logOf(id)).currentValue
          result = { kind: 'success', text: `current preset ${current} (available: ${Object.keys(PERMISSION_PRESETS).join(', ')})` }
        } else if (spec === undefined) {
          result = { kind: 'error', text: `unknown preset "${preset}" (available: ${Object.keys(PERMISSION_PRESETS).join(', ')})` }
        } else {
          if (permissionSelectOf(logOf(id)).currentValue !== preset) append(id, { type: 'permission/preset', data: { preset } })
          append(id, { type: 'sandbox/mode', data: { mode: spec.sandbox } })
          append(id, { type: 'approval/policy', data: { policy: spec.approval } })
          result = { kind: 'success', text: `preset ${preset}` }
        }
        append(id, { type: 'command/done', data: { commandId, ...result } })
        return { ok: true, value: { commandId, result } }
      }
      if (name === 'goal') {
        const commandId = `fx-cmd-${logOf(id).length}`
        append(id, { type: 'command/run', data: { commandId, name, args, source: { kind: 'user' } } })
        const objective = args.trim()
        const current = backscanGoal(logOf(id))
        let text
        if (objective === '') {
          text = current === null ? 'No goal is set. Usage: /goal <objective>' : `Current goal: ${current.goal.objective}`
        } else if (current !== null && current.goal.phase !== 'complete') {
          text = `A goal already exists (${current.goal.objective}). Clear it first.`
        } else {
          const created = appendGoalChange(id, {
            kind: 'goal/change', version: 1, operation: 'create',
            goal: { id: `fx-goal-${logOf(id).length}`, revision: 1, objective, phase: 'active', maxGoalRounds: 256 },
            roundsStarted: 0, createdAt: Date.now(), updatedAt: Date.now(),
          })
          text = `Goal created: ${created.goal.objective}`
        }
        const result = { kind: 'success', text }
        append(id, { type: 'command/done', data: { commandId, ...result } })
        return { ok: true, value: { commandId, result } }
      }
      const running = summaryOf(id)?.running === true
      const outcomes = {
        compact: 'fixture: compacted (fake action)',
        echo: args.trim(),
        plan: args.trim() === 'off'
          ? (running ? 'Leaving plan mode (applies from the next step).' : 'Plan mode off.')
          : (running
            ? 'Entering plan mode (applies from the next step). Use /plan off to leave.'
            : 'Plan mode on. Use /plan off to leave.'),
      }
      const text = name === undefined ? undefined : outcomes[name]
      if (name === undefined || text === undefined) return { ok: true, value: undefined }
      const commandId = `fx-cmd-${logOf(id).length}`
      append(id, { type: 'command/run', data: { commandId, name, args, source: { kind: 'user' } } })
      if (name === 'plan' && !running) {
        const plan = foldPlan(logOf(id))
        if (plan.wanted !== null && plan.wanted !== plan.active) {
          append(id, { type: 'plan/mode', data: { active: plan.wanted } })
        }
      }
      const result = { kind: 'success', ...text === '' ? {} : { text } }
      append(id, { type: 'command/done', data: { commandId, ...result } })
      return { ok: true, value: { commandId, result } }
    },
  }

  const goalView = (projection) => ({
    ...projection.goal,
    roundsStarted: projection.roundsStarted,
    createdAt: projection.createdAt,
    updatedAt: projection.updatedAt,
    activation: projection.goal.phase === 'active' ? 'armed' : 'disarmed',
  })

  const referenceRemotes = {
    files(id, query) {
      const missing = requireGoalSession(id)
      if (missing !== undefined) return missing
      const needle = query.toLocaleLowerCase()
      const items = [
        { path: 'notes', kind: 'directory' },
        { path: 'README.md', kind: 'file' },
        { path: 'notes/demo.txt', kind: 'file' },
      ].filter(item => item.path.toLocaleLowerCase().includes(needle))
      return { ok: true, value: items }
    },
    sessions(id, query) {
      const missing = requireGoalSession(id)
      if (missing !== undefined) return missing
      const needle = query.toLocaleLowerCase()
      const value = sessions
        .filter(item => item.sessionId !== id)
        .filter(item => String(item.sessionId).toLocaleLowerCase().includes(needle)
          || item.cwd?.toLocaleLowerCase().includes(needle) === true)
        .map((item) => {
          const label = item.sessionId === sid('fx-beta') ? 'Fixture child session' : String(item.sessionId)
          const encoded = btoa(JSON.stringify(item.sessionId))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replace(/=+$/u, '')
          return {
            sessionId: item.sessionId,
            label,
            ...item.cwd === undefined ? {} : { cwd: item.cwd },
            createdAt: item.updatedAt,
            mention: `@[${label}](freddie-session:${encoded})`,
          }
        })
      return { ok: true, value }
    },
  }

  const goalRemotes = {
    create(id, request) {
      const missing = requireGoalSession(id)
      if (missing !== undefined) return missing
      const current = backscanGoal(logOf(id))
      if (current !== null && current.goal.phase !== 'complete') {
        return goalFailure(`goal "${current.goal.id}" already exists`)
      }
      const now = Date.now()
      const projection = appendGoalChange(id, {
        kind: 'goal/change', version: 1, operation: 'create',
        goal: {
          id: `fx-goal-${logOf(id).length}`,
          revision: 1,
          objective: request.objective,
          phase: 'active',
          maxGoalRounds: request.maxGoalRounds ?? 256,
        },
        roundsStarted: 0, createdAt: now, updatedAt: now,
      })
      return { ok: true, value: { ref: { id: projection.goal.id, revision: projection.goal.revision } } }
    },
    edit(id, ref, request) {
      return mutateGoal(id, ref, current => ({
        ...current.goal,
        revision: current.goal.revision + 1,
        ...request.objective === undefined ? {} : { objective: request.objective },
        ...request.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.maxGoalRounds },
      }))
    },
    pause(id, ref) {
      return mutateGoal(id, ref, current => (
        current.goal.phase === 'active'
          ? { ...current.goal, revision: current.goal.revision + 1, phase: 'paused' }
          : undefined
      ))
    },
    resume(id, ref) {
      return mutateGoal(id, ref, current => (
        current.goal.phase === 'paused' || current.goal.phase === 'blocked' || current.goal.phase === 'active'
          ? { ...current.goal, revision: current.goal.revision + 1, phase: 'active' }
          : undefined
      ))
    },
    complete(id, ref) {
      return mutateGoal(id, ref, current => (
        current.goal.phase === 'complete'
          ? undefined
          : { ...current.goal, revision: current.goal.revision + 1, phase: 'complete' }
      ))
    },
    clear(id, ref) {
      const resolved = resolveGoal(id, ref)
      if (!resolved.ok) return resolved
      const current = resolved.value
      const tombstone = { id: current.goal.id, revision: current.goal.revision + 1 }
      appendGoalChange(id, {
        kind: 'goal/change', version: 1, operation: 'clear', cleared: tombstone, clearedAt: Date.now(),
      })
      return { ok: true, value: tombstone }
    },
  }

  function resolveGoal(id, ref) {
    const missing = requireGoalSession(id)
    if (missing !== undefined) return missing
    const current = backscanGoal(logOf(id))
    if (current === null || current.goal.id !== ref.id || current.goal.revision !== ref.revision) {
      return goalFailure('stale or missing goal revision')
    }
    return { ok: true, value: current }
  }

  function mutateGoal(
    id,
    ref,
    next,
  ) {
    const resolved = resolveGoal(id, ref)
    if (!resolved.ok) return resolved
    const current = resolved.value
    const goal = next(current)
    if (goal === undefined) {
      return goalFailure(`invalid goal transition from "${current.goal.phase}"`)
    }
    const projection = appendGoalChange(id, {
      kind: 'goal/change', version: 1,
      operation: goal.phase === current.goal.phase ? 'edit' : goal.phase === 'paused' ? 'pause' : goal.phase === 'active' ? 'resume' : 'complete',
      goal, roundsStarted: current.roundsStarted, createdAt: current.createdAt, updatedAt: Date.now(),
    })
    return { ok: true, value: goalView(projection) }
  }

  const mapGoalResult = (result, map) => (
    result.ok ? { ok: true, value: map(result.value) } : result
  )

  const goalRefResult = (result) => (
    mapGoalResult(result, view => ({ ref: { id: view.id, revision: view.revision } }))
  )

  const legacyGoalResponse = (request, result) => (
    Promise.resolve({ rpcId: request.rpcId, result })
  )

  const replays = new Map()

  let historyDelayMs = 0
  let failNextHistory = false
  const streamBreakers = new Set()
  const retryScenarios = new Map()
  let activeReasoningChunkStorm = null

  const timingHooks = {
    setHistoryDelay(ms) {
      historyDelayMs = ms
    },
    failNextHistory() {
      failNextHistory = true
    },
    appendUser(id, msg) {
      append(sid(id), { type: 'user/message', surfaceOp: 'append', data: userMessage(text(msg)) })
    },
    appendTitle(id, title) {
      const log = logOf(sid(id))
      const messageSeqs = log.filter(event => event.type === 'user/message').map(event => event.seq)
      append(sid(id), { type: 'session/title', data: { title, messageSeqs, source: { kind: 'provider', provider: 'fixture' } } })
    },
    startReasoningChunkStorm(
      id,
      chunkCount,
      chunksPerInterval,
      intervalMs,
    ) {
      if (!Number.isSafeInteger(chunkCount) || chunkCount < 1) {
        throw new Error('fixture: reasoning chunk count must be a positive safe integer')
      }
      if (!Number.isSafeInteger(chunksPerInterval) || chunksPerInterval < 1) {
        throw new Error('fixture: reasoning chunks per interval must be a positive safe integer')
      }
      if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
        throw new Error('fixture: reasoning interval must be a positive safe integer')
      }
      if (activeReasoningChunkStorm?.emitting === true) {
        throw new Error('fixture: reasoning chunk storm already running')
      }

      const sessionId = sid(id)
      const log = logOf(sessionId)
      let turn = nextTurn.get(sessionId) ?? 0
      for (const event of log) {
        const candidate = event.data?.turn
        if (typeof candidate === 'number') turn = Math.max(turn, candidate + 1)
      }
      nextTurn.set(sessionId, turn + 1)
      const marker = `REASONING_STRESS_COMPLETE:${String(turn)}:${String(chunkCount)}`
      const state = {
        sessionId: id,
        chunkCount,
        chunksPerInterval,
        intervalMs,
        emitted: 0,
        marker,
        emitting: true,
      }
      activeReasoningChunkStorm = state

      setRunning(sessionId, true)
      append(sessionId, { type: 'turn/start', data: { turn, trigger: { kind: 'message', source: { kind: 'user' } } } })
      append(sessionId, {
        type: 'user/message', surfaceOp: 'append',
        data: userMessage(text(`Reasoning chunk stress: ${String(chunkCount)} chunks.`)),
      })
      append(sessionId, { type: 'step/start', data: { turn, step: 0 } })
      append(sessionId, {
        type: 'assistant/chunk',
        data: { turn, step: 0, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } },
      })

      const startedAt = Date.now()
      const pump = () => {
        const elapsedIntervals = Math.floor((Date.now() - startedAt) / intervalMs) + 1
        const due = Math.max(state.emitted + chunksPerInterval, elapsedIntervals * chunksPerInterval)
        const end = Math.min(due, chunkCount)
        for (let index = state.emitted; index < end; index++) {
          const chunkText = index === chunkCount - 1
            ? `\n${marker}`
            : index % 64 === 63 ? '💭\n' : '💭'
          append(sessionId, {
            type: 'assistant/chunk',
            data: { turn, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: chunkText } },
          })
        }
        state.emitted = end
        if (end < chunkCount) {
          setTimeout(pump, intervalMs)
        } else {
          state.emitting = false
        }
      }
      setTimeout(pump, 0)
      return marker
    },
    reasoningChunkStormState() {
      return activeReasoningChunkStorm === null ? null : { ...activeReasoningChunkStorm }
    },
    beginModelRetry(id) {
      const sessionId = sid(id)
      const turn = nextTurn.get(sessionId) ?? 0
      nextTurn.set(sessionId, turn + 1)
      retryScenarios.set(sessionId, { turn, stepStarted: true })
      setRunning(sessionId, true)
      append(sessionId, { type: 'turn/start', data: { turn } })
      append(sessionId, { type: 'user/message', surfaceOp: 'append', data: { content: text('Please retry this request'), source: { kind: 'user' } } })
      append(sessionId, { type: 'step/start', data: { turn, step: 1 } })
      append(sessionId, { type: 'assistant/chunk', data: { turn, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } } })
      append(sessionId, { type: 'assistant/chunk', data: { turn, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Half a reply that should be retracted' } } })
    },
    scheduleModelRetry(id, retry = 1, delayMs = 450) {
      const sessionId = sid(id)
      const scenario = retryScenarios.get(sessionId)
      if (scenario === undefined) throw new Error(`fixture: no model retry scenario for ${id}`)
      if (!scenario.stepStarted) {
        append(sessionId, { type: 'assistant/chunk', data: { turn: scenario.turn, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } } })
        append(sessionId, { type: 'assistant/chunk', data: { turn: scenario.turn, step: 1, chunk: { type: 'text-delta', index: 0, text: `Reply number ${String(retry)} that should be retracted` } } })
        scenario.stepStarted = true
      }
      const failure = { code: 'TRANSPORT', message: 'Connection was reset' }
      append(sessionId, {
        type: 'llm/retry',
        data: {
          turn: scenario.turn, step: 1,
          provider: 'fixture', mode: 'normal', policyKey: 'fixture-normal',
          retry, maxRetries: 2, delayMs, failure,
        },
      })
      scenario.stepStarted = false
    },
    cancelModelRetryDuringBackoff(id, delayMs = 450) {
      const sessionId = sid(id)
      const scenario = retryScenarios.get(sessionId)
      if (scenario === undefined) throw new Error(`fixture: no model retry scenario for ${id}`)
      const failure = { code: 'TRANSPORT', message: 'Connection was reset' }
      append(sessionId, {
        type: 'llm/retry',
        data: {
          turn: scenario.turn, step: 1,
          provider: 'fixture', mode: 'normal', policyKey: 'fixture-normal',
          retry: 1, maxRetries: 2, delayMs, failure,
        },
      })
      append(sessionId, { type: 'step/end', data: { turn: scenario.turn, step: 1 } })
      append(sessionId, { type: 'turn/end', data: { turn: scenario.turn, reason: { kind: 'aborted', reason: { kind: 'user' } },
      } })
      retryScenarios.delete(sessionId)
      setRunning(sessionId, false)
    },
    completeModelRetry(id) {
      const sessionId = sid(id)
      const scenario = retryScenarios.get(sessionId)
      if (scenario === undefined) throw new Error(`fixture: no model retry scenario for ${id}`)
      retryScenarios.delete(sessionId)
      append(sessionId, { type: 'assistant/chunk', data: {
        turn: scenario.turn,
        step: 1,
        chunk: { type: 'block-start', index: 0, blockType: 'text' },
      } })
      append(sessionId, {
        type: 'assistant/message',
        surfaceOp: 'append',
        data: {
          turn: scenario.turn,
          step: 1,
          message: assistantMessage(text('Complete reply after the retry')),
        },
      })
      append(sessionId, { type: 'step/end', data: { turn: scenario.turn, step: 1 } })
      append(sessionId, { type: 'turn/end', data: { turn: scenario.turn, reason: { kind: 'completed' } } })
      setRunning(sessionId, false)
    },
    appendSilent(id, msg) {
      const log = logOf(sid(id))
      log.push({ type: 'user/message', surfaceOp: 'append', seq: log.length, time: Date.now(), data: userMessage(text(msg)) })
    },
    breakStreams() {
      for (const breakNow of [...streamBreakers]) breakNow()
    },
  }
  ;(globalThis).__fxTiming = timingHooks

  const startReply = (id, turn, replyText) => {
    const step = 0
    append(id, { type: 'step/start', data: { turn, step } })
    append(id, { type: 'assistant/chunk', data: { turn, step, chunk: { type: 'block-start', index: 0, blockType: 'text' } } })
    /* v8 ignore next */
    const pieces = replyText.match(/[\s\S]{1,6}/gu) ?? [replyText]
    let i = 0
    const finish = (aborted) => {
      replays.delete(id)
      const done = pieces.slice(0, i).join('')
      append(id, { type: 'assistant/chunk', data: { turn, step, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: done } } } })
      append(id, {
        type: 'assistant/message',
        surfaceOp: 'append',
        data: {
          turn,
          step,
          message: assistantMessage(text(aborted ? `${done} (interrupted)` : done)),
          usage: fixtureUsage(turn, step),
        },
      })
      append(id, { type: 'step/end', data: { turn, step } })
      append(id, { type: 'turn/end', data: { turn, reason: { kind: aborted ? 'cancelled' : 'completed' } } })
      setRunning(id, false)
    }
    const tick = () => {
      const piece = pieces[i]
      if (piece === undefined) {
        finish(false)
        return
      }
      i++
      append(id, { type: 'assistant/chunk', data: { turn, step, chunk: { type: 'text-delta', index: 0, text: piece } } })
      replays.set(id, { timer: setTimeout(tick, 80), finish })
    }
    replays.set(id, { timer: setTimeout(tick, 80), finish })
  }

  const api = {
    sessions: {
      list: request => ok(request, { items: [...sessions].sort((a, b) => b.updatedAt - a.updatedAt) }),
      search: (request, signal) => {
        if (signal.aborted) {
          return err(request, {
            code: 'cancelled',
            message: 'fixture session search was aborted',
            details: {},
          })
        }
        const query = searchTokenSpans(request.payload.query).tokens.map(token => token.value)
        const matches = sessions.flatMap((summary) => {
          const log = logs.get(summary.sessionId) ?? []
          const current = new Set(foldSurface(log).nodes)
          const best = log.flatMap((event) => {
            if (!current.has(event.seq)) return []
            const eventText = searchEventText(event)
            const document = searchTokenSpans(eventText)
            const match = phraseMatch(document.tokens, query)
            if (match.count === 0) return []
            return [{
              sessionId: summary.sessionId,
              seq: event.seq,
              time: event.time,
              text: document.text,
              matchCount: match.count,
              matchStart: match.start,
              matchEnd: match.end,
              documentLength: Array.from(eventText).length,
            }]
          }).sort(compareSearchCandidates)[0]
          return best === undefined ? [] : [best]
        }).sort(compareSearchCandidates)
        return ok(request, {
          items: matches.slice(0, SESSION_SEARCH_RESULT_LIMIT).map(match => ({
            sessionId: match.sessionId,
            snippet: searchSnippet(match.text, match.matchStart, match.matchEnd),
          })),
          hasMore: matches.length > SESSION_SEARCH_RESULT_LIMIT,
        })
      },
      create: async (request) => {
        const workspace = request.payload.workspaceId === undefined
          ? undefined
          : workspaces.find(w => w.workspaceId === request.payload.workspaceId)
        if (request.payload.workspaceId !== undefined && workspace === undefined) {
          return err(request, {
            code: 'workspace-not-found',
            message: `no workspace ${request.payload.workspaceId}`,
            details: { workspaceId: request.payload.workspaceId },
          })
        }
        const cwd = workspace?.path ?? request.payload.cwd ?? '/tmp/fixture'
        const requestedId = request.payload.sessionId
        const attachWorkspace = (sessionId) => {
          /* v8 ignore next */
          if (workspace === undefined || workspace.sessionIds.includes(sessionId)) return
          workspace.sessionIds = [sessionId, ...workspace.sessionIds]
          workspace.updatedAt = new Date().toISOString()
          emitHost({ type: 'host/workspace-changed', workspace: { ...workspace } })
        }
        const attachFailure = (
          sessionId,
          workspaceId,
        ) => err(request, {
          code: 'workspace-attach-failed',
          message: `fixture rejected Workspace attachment for ${sessionId}`,
          details: { sessionId, workspaceId },
        })
        if (requestedId !== undefined) {
          const existing = summaryOf(requestedId)
          if (existing !== undefined) {
            if (existing.cwd !== cwd) {
              return err(request, {
                code: 'session-conflict',
                message: `session ${requestedId} already uses ${existing.cwd ?? 'no cwd'}`,
                details: { sessionId: requestedId, requestedCwd: cwd, ...existing.cwd === undefined ? {} : { existingCwd: existing.cwd } },
              })
            }
            if (workspace !== undefined && !workspace.sessionIds.includes(requestedId)) {
              if (options.failWorkspaceAttach) return attachFailure(requestedId, workspace.workspaceId)
              attachWorkspace(requestedId)
            }
            return ok(request, { sessionId: requestedId })
          }
        }
        const created = {
          sessionId: requestedId ?? sid(`fx-${nextSession++}`), updatedAt: Date.now(), running: false, blank: true, cwd,
        }
        sessions.push(created)
        modelSelections.set(created.sessionId, { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
        attachedSessions += 1
        const emitSession = () => {
          emitHost({ type: 'host/session-added', sessionId: created.sessionId, blank: true, cwd })
        }
        if (workspace !== undefined && options.failWorkspaceAttach) {
          emitSession()
          return attachFailure(created.sessionId, workspace.workspaceId)
        }
        if (workspace !== undefined && options.createFrameOrder === 'workspace-first') {
          attachWorkspace(created.sessionId)
          emitSession()
        } else {
          emitSession()
          if (workspace !== undefined) attachWorkspace(created.sessionId)
        }
        if (options.dropSessionCreateResponse) throw new Error('fixture: dropped session.create response after publication')
        return ok(request, { sessionId: created.sessionId })
      },
      rename: (request) => {
        const missing = requireSession(request)
        if (missing !== undefined) return missing
        const { sessionId, title } = request.payload
        const normalized = title.trim().replace(/\s+/g, ' ')
        if (normalized.length === 0) {
          return err(request, {
            code: 'title-invalid',
            message: 'session title must contain visible characters',
            details: { sessionId },
          })
        }
        append(sessionId, {
          type: 'session/title',
          data: { title: normalized, messageSeqs: [], source: { kind: 'user' } },
        })
        const appended = logOf(sessionId).at(-1)
        return ok(request, { title: normalized, seq: appended.seq })
      },
      fork: (request) => {
        const { sessionId, atSeq } = request.payload
        const source = summaryOf(sessionId)
        if (source === undefined) {
          return err(request, {
            code: 'session-not-found',
            message: `no session ${sessionId}`,
            details: { sessionId },
          })
        }
        const log = logs.get(sessionId) ?? []
        const lastSeq = log.at(-1)?.seq ?? -1
        const anchoredBoundary = atSeq === undefined
          ? undefined
          : log.find(e => e.type === 'turn/end' && e.seq >= atSeq)
        const boundary = anchoredBoundary
          ?? (atSeq === undefined || atSeq > lastSeq
            ? log.findLast(e => e.type === 'turn/end')
            : undefined)
        if (boundary === undefined) {
          return err(request, {
            code: 'fork-unavailable',
            message: atSeq !== undefined && atSeq <= lastSeq
              ? `session ${sessionId} has not completed the turn containing event ${String(atSeq)}`
              : `session ${sessionId} has no completed turn`,
            details: { sessionId },
          })
        }
        let cut = boundary.seq + 1
        while (cut < log.length && log[cut]?.type !== 'turn/start') cut++
        const child = {
          sessionId: sid(`fx-${nextSession++}`), updatedAt: Date.now(), running: false, blank: false,
          parentSessionId: sessionId,
          ...source.cwd === undefined ? {} : { cwd: source.cwd },
        }
        logs.set(child.sessionId, log.slice(0, cut))
        sessions.push(child)
        emitHost({
          type: 'host/session-added', sessionId: child.sessionId, blank: false,
          parentSessionId: sessionId,
          ...source.cwd === undefined ? {} : { cwd: source.cwd },
        })
        const workspace = workspaces.find(w => w.sessionIds.includes(sessionId))
        if (workspace !== undefined) {
          workspace.sessionIds = [child.sessionId, ...workspace.sessionIds]
          workspace.updatedAt = new Date().toISOString()
          emitHost({ type: 'host/workspace-changed', workspace: { ...workspace } })
        }
        return ok(request, { sessionId: child.sessionId })
      },
      history: async (request) => {
        const log = logs.get(request.payload.sessionId) ?? []
        const page = pageOf(log, request.payload.beforeSeq, request.payload.maxMessages ?? 50)
        const projections = request.payload.beforeSeq === undefined
          ? { asOfSeq: log.length - 1, values: projectionValuesOf(log) }
          : undefined
        const doomed = failNextHistory
        failNextHistory = false
        const delay = historyDelayMs
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
        if (doomed) throw new Error('fixture: simulated history transport failure')
        return ok(request, { ...page, ...projections === undefined ? {} : { projections } })
      },
      models: request => ok(request, {
        current: modelSelections.get(request.payload.sessionId)
          ?? { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
        routable: ALL_FIXTURE_ROUTES_SERVE,
        groups: fixtureModelGroups(),
        failures: [],
      }),
      selectModel: (request) => {
        const selected = {
          provider: request.payload.provider,
          model: request.payload.model,
          ...request.payload.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: request.payload.reasoningEffort },
        }
        modelSelections.set(request.payload.sessionId, selected)
        return ok(request, { selected })
      },
      prompt: (request) => {
        const { sessionId: id, mode, content } = request.payload
        const summary = summaryOf(id)
        if (summary === undefined) {
          return err(request, { code: 'session-not-found', message: `no session ${id}`, details: { sessionId: id } })
        }
        if (options.rejectPrompt) {
          if (content.some(block => block.type === 'image')) {
            return err(request, {
              code: 'attachment-error',
              message: 'fixture: image side exceeds the deployment limit',
              details: { reason: 'IMAGE_DIMENSION_TOO_LARGE' },
            })
          }
          return err(request, {
            code: 'agent-busy',
            message: 'fixture: prompt rejected before acceptance',
            details: { reason: 'fixture-prompt-rejection' },
          })
        }
        summary.updatedAt = Date.now()
        summary.blank = false
        const userText = content.map(b => (b.type === 'text' ? b.text : '')).join('')
        const durable = content.map((block) => {
          if (block.type === 'text') return block
          const attachment = {
            attachmentId: `fixture:${randomUuid()}`,
            mediaType: block.mediaType,
            bytes: Math.max(
              1,
              Math.floor(block.data.length * 3 / 4)
              - (block.data.endsWith('==') ? 2 : block.data.endsWith('=') ? 1 : 0),
            ),
            width: 160,
            height: 90,
            ...block.name === undefined ? {} : { name: block.name },
          }
          attachments.set(String(attachment.attachmentId), { attachment, data: block.data })
          return { type: 'image', attachment }
        })
        const steersRunningReplay = mode === 'steer' && replays.has(id)
        if (steersRunningReplay) {
          append(id, { type: 'user/message', surfaceOp: 'append', data: userMessage(durable) })
          return ok(request, { accepted: true })
        }
        const turn = nextTurn.get(id) ?? 0
        nextTurn.set(id, turn + 1)
        setRunning(id, true)
        append(id, { type: 'turn/start', data: { turn } })
        commitOutstandingPlanSelection(id)
        append(id, { type: 'user/message', surfaceOp: 'append', data: userMessage(durable) })
        recordRouteContextOnModelChange(id)
        startReply(
          id,
          turn,
          userText === 'render markdown'
            ? MARKDOWN_FIXTURE
            : userText === 'report model'
              ? (() => {
                const selection = modelSelections.get(id)
                return `Current model: ${selection?.provider ?? 'unknown'}/${selection?.model ?? 'unknown'}`
                  + (selection?.reasoningEffort === undefined ? '' : ` · Reasoning effort: ${selection.reasoningEffort}`)
              })()
              : `Echo: ${userText}. This is the fixture streaming reply, used to verify typewriter growth and finalization switching.`,
        )
        return ok(request, { accepted: true })
      },
      attachment: (request) => {
        const stored = attachments.get(String(request.payload.attachmentId))
        if (stored === undefined) {
          return err(request, {
            code: 'attachment-error',
            message: 'fixture attachment missing',
            details: { reason: 'ATTACHMENT_NOT_FOUND' },
          })
        }
        if (!logReferencesAttachment(
          logs.get(request.payload.sessionId) ?? [],
          String(request.payload.attachmentId),
        )) {
          return err(request, {
            code: 'attachment-error',
            message: 'fixture attachment is not referenced by this session',
            details: { reason: 'ATTACHMENT_NOT_REFERENCED' },
          })
        }
        return ok(request, stored)
      },
      updateQueue: request => err(request, {
        code: 'queue-item-not-found',
        message: 'fixture has no pending queue item',
        details: { itemId: request.payload.itemId },
      }),
      cancel: (request) => {
        const replay = replays.get(request.payload.sessionId)
        if (replay !== undefined) {
          clearTimeout(replay.timer)
          replay.finish(true)
        } else {
          setRunning(request.payload.sessionId, false)
        }
        return ok(request, { accepted: true })
      },
    },
    subagents: {
      list: request => ok(request, { entries: [], parentAvailable: true }),
      history: (request) => {
        const log = logs.get(request.payload.childSessionId) ?? []
        return Promise.resolve(ok(
          request,
          pageOf(log, request.payload.beforeSeq, request.payload.maxMessages ?? 50),
        ))
      },
      prompt: request => Promise.resolve(ok(request, {
        messageId: `fixture-message-${request.payload.childSessionId}`,
      })),
      interrupt: request => Promise.resolve(ok(request, { accepted: true })),
    },
    host: {
      describe: request => ok(request, {
        version: '0.0.0-fixture', cwd: '/tmp/fixture', attachedSessions, home: FIXTURE_HOME, canOpenPath: true,
      }),
      pickDirectory: request => ok(request, { path: FIXTURE_PROJECT_DIRECTORY }),
      listDirectory: (request) => {
        const target = request.payload.path ?? FIXTURE_HOME
        const children = childrenOf(target)
        if (children === undefined) {
          return err(request, { code: 'directory-unreadable', message: `cannot list ${target}: not in the fixture tree`, details: { path: target } })
        }
        return ok(request, {
          path: target,
          home: FIXTURE_HOME,
          crumbs: crumbsOf(target),
          entries: [...children].sort((a, b) => a.localeCompare(b))
            .map(name => ({ name, path: joinTreePath(target, name), hidden: name.startsWith('.') })),
          truncated: false,
        })
      },
      createDirectory: (request) => {
        const parent = request.payload.path
        const children = childrenOf(parent)
        if (children === undefined) {
          return err(request, { code: 'directory-create-failed', message: `missing parent ${parent}`, details: { path: parent } })
        }
        const target = joinTreePath(parent, request.payload.name)
        if (children.includes(request.payload.name)) {
          return err(request, { code: 'directory-exists', message: `${target} already exists`, details: { path: target } })
        }
        directoryTree.set(parent, [...children, request.payload.name])
        directoryTree.set(target, [])
        return ok(request, { path: target })
      },
      openPath: deterministicNativeOpen,
    },
    workspace: {
      list: request => ok(request, {
        items: workspaces.map(w => ({ ...w })),
        archivedSessionIds: [...archivedSessionIds],
      }),
      create: (request) => {
        const { path } = request.payload
        const existing = workspaces.find(w => w.path === path)
        if (existing !== undefined) return ok(request, { workspace: { ...existing }, created: false })
        const now = new Date().toISOString()
        const created = {
          workspaceId: wid(`fx-ws-${nextWorkspace++}`),
          path,
          title: path.split('/').filter(Boolean).at(-1) ?? path,
          sessionIds: [],
          createdAt: now,
          updatedAt: now,
        }
        workspaces.unshift(created)
        emitHost({ type: 'host/workspace-changed', workspace: { ...created } })
        return ok(request, { workspace: { ...created }, created: true })
      },
      rename: (request) => {
        const { workspaceId, title } = request.payload
        const workspace = workspaces.find(w => w.workspaceId === workspaceId)
        if (workspace === undefined) {
          return err(request, {
            code: 'workspace-not-found',
            message: `no workspace ${workspaceId}`,
            details: { workspaceId },
          })
        }
        const trimmed = title.trim()
        if (trimmed !== workspace.title) {
          if (workspaces.some(w => w.workspaceId !== workspaceId && w.title === trimmed)) {
            return err(request, {
              code: 'workspace-name-conflict',
              message: `workspace name '${trimmed}' is already in use`,
              details: { name: trimmed },
            })
          }
          workspace.title = trimmed
          workspace.updatedAt = new Date().toISOString()
          emitHost({ type: 'host/workspace-changed', workspace: { ...workspace } })
        }
        return ok(request, { workspace: { ...workspace } })
      },
      delete: (request) => {
        const { workspaceId } = request.payload
        const index = workspaces.findIndex(workspace => workspace.workspaceId === workspaceId)
        if (index === -1) {
          return err(request, {
            code: 'workspace-not-found',
            message: `no workspace ${workspaceId}`,
            details: { workspaceId },
          })
        }
        workspaces.splice(index, 1)
        emitHost({ type: 'host/workspace-removed', workspaceId })
        return ok(request, { deleted: true })
      },
      insertBefore: (request) => {
        const { workspaceId, beforeWorkspaceId } = request.payload
        const source = workspaces.findIndex(workspace => workspace.workspaceId === workspaceId)
        const anchor = beforeWorkspaceId === undefined
          ? workspaces.length
          : workspaces.findIndex(workspace => workspace.workspaceId === beforeWorkspaceId)
        const missing = source === -1 ? workspaceId : anchor === -1 ? beforeWorkspaceId : undefined
        if (missing !== undefined) {
          return err(request, {
            code: 'workspace-not-found',
            message: `no workspace ${missing}`,
            details: { workspaceId: missing },
          })
        }
        if (beforeWorkspaceId !== workspaceId) {
          const previousOrder = workspaces.map(candidate => candidate.workspaceId)
          const [workspace] = workspaces.splice(source, 1)
          /* v8 ignore next */
          if (workspace === undefined) throw new Error(`fixture lost workspace ${workspaceId}`)
          const at = beforeWorkspaceId === undefined
            ? workspaces.length
            : workspaces.findIndex(candidate => candidate.workspaceId === beforeWorkspaceId)
          workspaces.splice(at, 0, workspace)
          if (workspaces.some((candidate, index) => candidate.workspaceId !== previousOrder[index])) {
            emitHost({
              type: 'host/workspace-order-changed',
              workspaceIds: workspaces.map(candidate => candidate.workspaceId),
            })
          }
        }
        return ok(request, { workspaceIds: workspaces.map(candidate => candidate.workspaceId) })
      },
      insertSessionBefore: (request) => {
        const { workspaceId, sessionId, beforeSessionId } = request.payload
        const workspace = workspaces.find(w => w.workspaceId === workspaceId)
        if (workspace === undefined) {
          return err(request, {
            code: 'workspace-not-found',
            message: `no workspace ${workspaceId}`,
            details: { workspaceId },
          })
        }
        if (!workspace.sessionIds.includes(sessionId)
          || (beforeSessionId !== undefined && !workspace.sessionIds.includes(beforeSessionId))) {
          return err(request, {
            code: 'workspace-move-invalid',
            message: `session or anchor is not accounted by workspace ${workspaceId}`,
            details: { workspaceId, sessionId, ...beforeSessionId === undefined ? {} : { beforeSessionId } },
          })
        }
        const without = workspace.sessionIds.filter(id => id !== sessionId)
        const at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId)
        const sessionIds = [...without.slice(0, at), sessionId, ...without.slice(at)]
        if (!sessionIds.every((id, index) => id === workspace.sessionIds[index])) {
          workspace.sessionIds = sessionIds
          workspace.updatedAt = new Date().toISOString()
          emitHost({ type: 'host/workspace-changed', workspace: { ...workspace } })
        }
        return ok(request, { workspace: { ...workspace } })
      },
      archiveSession: (request) => {
        const missing = requireSession(request)
        if (missing !== undefined) return missing
        const { sessionId } = request.payload
        if (!archivedSessionIds.includes(sessionId)) {
          archivedSessionIds.push(sessionId)
          emitHost({ type: 'host/archived-sessions-changed', archivedSessionIds: [...archivedSessionIds] })
        }
        return ok(request, { archivedSessionIds: [...archivedSessionIds] })
      },
    },
    agentPresets: {
      list: request => ok(request, {
        presets: [...fixturePresets].map(([id, preset]) => ({
          id,
          trust: preset.trust,
          isDefault: id === fixtureDefaultPreset,
        })),
        authorable: true,
        hasDocument: true,
      }),
      select: (request) => {
        fixtureDefaultPreset = request.payload.agentPreset
        return ok(request, { agentPreset: request.payload.agentPreset })
      },
      read: (request) => {
        const { agentPreset } = request.payload
        const preset = fixturePresets.get(agentPreset)
        if (preset === undefined) {
          return err(request, {
            code: 'agent-preset-not-found',
            message: `unknown agent preset "${agentPreset}"`,
            details: { agentPreset, available: [...fixturePresets.keys()] },
          })
        }
        return ok(request, {
          agentPreset,
          trust: preset.trust,
          content: preset.content,
        })
      },
      copy: (request) => {
        const { from, agentPreset } = request.payload
        const source = fixturePresets.get(from)
        if (source === undefined) {
          return err(request, {
            code: 'agent-preset-not-found',
            message: `unknown agent preset "${from}"`,
            details: { agentPreset: from, available: [...fixturePresets.keys()] },
          })
        }
        if (fixturePresets.has(agentPreset)) {
          return err(request, {
            code: 'agent-preset-invalid',
            message: `agent preset "${agentPreset}" already exists`,
            details: { agentPreset, reason: 'already exists' },
          })
        }
        fixturePresets.set(agentPreset, { trust: 'user', content: source.content })
        return ok(request, { agentPreset })
      },
      openDocument: (request) => {
        const { agentPreset } = request.payload
        const existing = fixturePresets.get(agentPreset)
        if (existing === undefined || existing.trust === 'system') {
          return err(request, {
            code: 'agent-preset-read-only',
            message: `agent preset "${agentPreset}" ships with the deployment`,
            details: { agentPreset, reason: 'it ships with the deployment' },
          })
        }
        return ok(request, { opened: true })
      },
      remove: (request) => {
        const { agentPreset } = request.payload
        const existing = fixturePresets.get(agentPreset)
        if (existing?.trust === 'system') {
          return err(request, {
            code: 'agent-preset-read-only',
            message: `agent preset "${agentPreset}" ships with the deployment`,
            details: { agentPreset, reason: 'it ships with the deployment' },
          })
        }
        fixturePresets.delete(agentPreset)
        return ok(request, {})
      },
    },

    skills: {
      list: (request) => {
        const missing = requireSession(request)
        if (missing !== undefined) return missing
        return ok(request, {
          skills: [
            { name: 'fixture-demo', description: 'fixture skill sample', whenToUse: 'For UI catalog render acceptance only', modelInvocable: true },
            { name: 'fixture-user-only', description: 'fixture user-only skill sample', modelInvocable: false },
          ],
        })
      },
    },
    goals: {
      create: request => legacyGoalResponse(
        request,
        mapGoalResult(
          goalRemotes.create(request.payload.sessionId, {
            objective: request.payload.objective,
            ...request.payload.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.payload.maxGoalRounds },
          }),
          value => ({ ref: { id: value.ref.id, revision: value.ref.revision } }),
        ),
      ),
      edit: request => legacyGoalResponse(
        request,
        goalRefResult(goalRemotes.edit(request.payload.sessionId, request.payload.ref, {
          ...request.payload.objective === undefined ? {} : { objective: request.payload.objective },
          ...request.payload.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.payload.maxGoalRounds },
        })),
      ),
      pause: request => legacyGoalResponse(
        request,
        goalRefResult(goalRemotes.pause(request.payload.sessionId, request.payload.ref)),
      ),
      resume: request => legacyGoalResponse(
        request,
        goalRefResult(goalRemotes.resume(request.payload.sessionId, request.payload.ref)),
      ),
      complete: request => legacyGoalResponse(
        request,
        goalRefResult(goalRemotes.complete(request.payload.sessionId, request.payload.ref)),
      ),
      clear: request => legacyGoalResponse(
        request,
        mapGoalResult(
          goalRemotes.clear(request.payload.sessionId, request.payload.ref),
          () => ({ cleared: true }),
        ),
      ),
    },
    events: {
      async *mux(_request, signal) {
        const conn = new FxInbox()
        muxConns.add(conn)
        const breakNow = () => { conn.breakNow() }
        streamBreakers.add(breakNow)
        for (const s of sessions) {
          if (!s.running) continue
          const log = logs.get(s.sessionId) ?? []
          conn.push({ rpcId: mint(), payload: { type: 'session/subscribed', sessionId: s.sessionId, lastSeq: log.length - 1 } })
          const values = projectionValuesOf(log)
          for (const key of Object.keys(values)) {
            conn.push({ rpcId: mint(), payload: { type: 'session/projection', sessionId: s.sessionId, key, value: values[key], seq: log.length - 1 } })
          }
        }
        if (approvalPending) {
          conn.push({
            rpcId: pendingApprovalRpcId,
            payload: {
              type: 'approval/requested', sessionId: sid('fx-alpha'),
              approvalId: pendingApprovalId,
              toolName: 'dangerous_tool', reason: 'fixture persistent approval (answer: disappears after approve/deny)',
            },
          })
        }
        if (questionPending) {
          conn.push({
            rpcId: pendingQuestionRpcId,
            payload: {
              type: 'question/requested', sessionId: sid('fx-alpha'), questions: fixtureQuestions,
            },
          })
        }
        try {
          yield* conn.drain(signal)
        } finally {
          streamBreakers.delete(breakNow)
          muxConns.delete(conn)
        }
      },
      async *host(_request, signal) {
        const conn = new FxInbox()
        hostConns.add(conn)
        const breakNow = () => { conn.breakNow() }
        streamBreakers.add(breakNow)
        const GAMMA_FLIP_INTERVAL_MS = 5000
        const timer = setInterval(() => {
          const gamma = summaryOf(sid('fx-gamma'))
          /* v8 ignore next */
          if (gamma !== undefined) setRunning(gamma.sessionId, !gamma.running)
        }, GAMMA_FLIP_INTERVAL_MS)
        try {
          yield* conn.drain(signal)
        } finally {
          clearInterval(timer)
          streamBreakers.delete(breakNow)
          hostConns.delete(conn)
        }
      },
    },
    settings: {
      describe: request => ok(request, {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns: 'llm-deepseek',
          schema: {},
          value: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
          applies: 'live',
          secrets: [{ path: ['apiKey'], set: false }],
          revision: 0,
        }],
      }),
      openDocument: deterministicNativeOpen,
      update: request => err(request, {
        code: 'settings-rejected',
        message: 'fixture: the minimal readiness settings descriptor is read-only',
        details: { ns: request.payload.ns },
      }),
      replace: request => err(request, {
        code: 'settings-rejected',
        message: 'fixture: the minimal readiness settings descriptor is read-only',
        details: { ns: request.payload.ns },
      }),
      mutate: request => err(request, {
        code: 'settings-rejected',
        message: 'fixture: no settings namespaces are registered',
        details: { ns: request.payload.ns },
      }),
    },
    credentials: {
      describe: request => ok(request, {
        credentials: Object.fromEntries(request.payload.refs.map(ref => [ref, {
          configured: fixtureCredentials.has(ref),
          ...fixtureCredentials.has(ref) ? { source: 'file' } : {},
          writable: true,
        }])),
      }),
      set: (request) => {
        fixtureCredentials.set(request.payload.ref, true)
        return ok(request, {})
      },
      unset: (request) => {
        fixtureCredentials.delete(request.payload.ref)
        return ok(request, {})
      },
    },
    llm: {
      providers: request => ok(request, {
        providers: [
          { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
          { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: true, declared: false },
          { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], active: false, declared: false },
          { provider: 'acme-gateway', displayName: 'Acme Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'acme-gateway'], active: true, declared: true },
        ],
      }),
      models: request => ok(request, { groups: fixtureModelGroups(), failures: [] }),
      discoverModels: request => ok(request, {
        models: fixtureModelGroups().flatMap(group => group.models.map(model => ({ id: model.id, name: model.name }))),
      }),
    },
    respond(message) {
      if (message.rpcId === pendingApprovalRpcId) {
        if (!approvalPending) return Promise.resolve({ accepted: false, reason: 'not-pending' })
        if (!message.result.ok) return Promise.resolve({ accepted: false, reason: 'bad-response' })
        const value = message.result.value
        if (value.approvalId !== pendingApprovalId || (value.outcome !== 'allowed-once' && value.outcome !== 'rejected')) {
          return Promise.resolve({ accepted: false, reason: 'bad-response' })
        }
        approvalPending = false
        emitMux({ type: 'approval/resolved', sessionId: sid('fx-alpha'), approvalId: pendingApprovalId, outcome: value.outcome })
        return Promise.resolve({ accepted: true })
      }
      if (!questionPending || message.rpcId !== pendingQuestionRpcId) {
        return Promise.resolve({ accepted: false, reason: 'not-pending' })
      }
      questionPending = false
      emitMux({
        type: 'question/resolved', sessionId: sid('fx-alpha'),
        questionRpcId: pendingQuestionRpcId,
        outcome: message.result.ok ? 'answered' : 'cancelled',
      })
      return Promise.resolve({ accepted: true })
    },
    downloads: {
      sessionLog: () => Promise.resolve(new Response('fixture mode does not serve session export', { status: 404 })),
    },
  }

  const rpc = {
    call(channel, endpoint, payload) {
      if (channel !== '/api') {
        return Promise.reject(new Error(`fixture connection RPC channel ${JSON.stringify(channel)} is unavailable`))
      }
      const args = payload.args
      const sessionId = args.agentId
      switch (endpoint) {
        case 'commands/list': return Promise.resolve(commandRemotes.list(sessionId))
        case 'commands/execute': return Promise.resolve(commandRemotes.execute(sessionId, args.line, args.images ?? []))
        case 'fileReferences/list': return Promise.resolve(referenceRemotes.files(sessionId, args.query ?? ''))
        case 'sessionReferenceResolver/candidates': return Promise.resolve(referenceRemotes.sessions(sessionId, args.query ?? ''))
        case 'goals/create': return Promise.resolve(goalRemotes.create(sessionId, {
          objective: args.request?.objective,
          ...args.request?.maxGoalRounds === undefined ? {} : { maxGoalRounds: args.request.maxGoalRounds },
        }))
        case 'goals/edit': return Promise.resolve(goalRemotes.edit(sessionId, args.ref, args.request ?? {}))
        case 'goals/pause': return Promise.resolve(goalRemotes.pause(sessionId, args.ref))
        case 'goals/resume': return Promise.resolve(goalRemotes.resume(sessionId, args.ref))
        case 'goals/complete': return Promise.resolve(goalRemotes.complete(sessionId, args.ref))
        case 'goals/clear': return Promise.resolve(goalRemotes.clear(sessionId, args.ref))
        default:
          return Promise.reject(new Error(`fixture connection RPC endpoint ${JSON.stringify(endpoint)} is unavailable`))
      }
    },
  }
  return { api, rpc }
}

export class FixtureApiClient extends AbstractApiClient {
  rpc

  constructor() {
    super()
    const world = createFixtureWorld(fixtureOptionsFromLocation())
    this.api = world.api
    this.rpc = world.rpc
  }

  doFetch() {
    throw new Error('FixtureApiClient overrides all protocol paths; doFetch must be unreachable')
  }

  async callUnary(
    method,
    payload,
    signal,
  ) {
    const request = rpcRequest(payload)
    const full = { type: 'client-request', rpcId: request.rpcId, method, payload }
    this.onEnvelope(full)
    const response = await this.dispatch(
      method,
      request,
      signal ?? new AbortController().signal,
    )
    const fullResponse = { type: 'server-response', rpcId: response.rpcId, result: response.result }
    this.onEnvelope(fullResponse)
    return response
  }

  dispatch(
    method,
    request,
    signal,
  ) {
    switch (method) {
      case 'session.list': return this.api.sessions.list(request)
      case 'session.search': return this.api.sessions.search(request, signal)
      case 'session.create': return this.api.sessions.create(request)
      case 'session.history': return this.api.sessions.history(request)
      case 'session.models': return this.api.sessions.models(request)
      case 'session.selectModel': return this.api.sessions.selectModel(request)
      case 'session.rename': return this.api.sessions.rename(request)
      case 'session.fork': return this.api.sessions.fork(request)
      case 'session.prompt': return this.api.sessions.prompt(request)
      case 'session.attachment': return this.api.sessions.attachment(request)
      case 'session.updateQueue': return this.api.sessions.updateQueue(request)
      case 'session.cancel': return this.api.sessions.cancel(request)
      case 'subagent.list': return this.api.subagents.list(request)
      case 'subagent.history': return this.api.subagents.history(request)
      case 'subagent.prompt': return this.api.subagents.prompt(request, signal)
      case 'subagent.interrupt': return this.api.subagents.interrupt(request)
      case 'host.describe': return this.api.host.describe(request)
      case 'host.pickDirectory': return this.api.host.pickDirectory(request, new AbortController().signal)
      case 'host.listDirectory': return this.api.host.listDirectory(request, new AbortController().signal)
      case 'host.createDirectory': return this.api.host.createDirectory(request)
      case 'host.openPath': return this.api.host.openPath(request, new AbortController().signal)
      case 'workspace.list': return this.api.workspace.list(request)
      case 'workspace.create': return this.api.workspace.create(request)
      case 'workspace.rename': return this.api.workspace.rename(request)
      case 'workspace.delete': return this.api.workspace.delete(request)
      case 'workspace.insertBefore': return this.api.workspace.insertBefore(request)
      case 'workspace.insertSessionBefore': return this.api.workspace.insertSessionBefore(request)
      case 'workspace.archiveSession': return this.api.workspace.archiveSession(request)
      case 'skill.list': return this.api.skills.list(request)
      case 'agentPreset.list': return this.api.agentPresets.list(request)
      case 'agentPreset.select': return this.api.agentPresets.select(request)
      case 'agentPreset.read': return this.api.agentPresets.read(request)
      case 'agentPreset.copy': return this.api.agentPresets.copy(request)
      case 'agentPreset.openDocument': return this.api.agentPresets.openDocument(request, new AbortController().signal)
      case 'agentPreset.remove': return this.api.agentPresets.remove(request)
      case 'goal.create': return this.api.goals.create(request)
      case 'goal.edit': return this.api.goals.edit(request)
      case 'goal.pause': return this.api.goals.pause(request)
      case 'goal.resume': return this.api.goals.resume(request)
      case 'goal.complete': return this.api.goals.complete(request)
      case 'goal.clear': return this.api.goals.clear(request)
      case 'settings.describe': return this.api.settings.describe(request)
      case 'settings.openDocument': return this.api.settings.openDocument(request, signal)
      case 'settings.update': return this.api.settings.update(request)
      case 'settings.replace': return this.api.settings.replace(request)
      case 'settings.mutate': return this.api.settings.mutate(request)
      case 'credentials.describe': return this.api.credentials.describe(request)
      case 'credentials.set': return this.api.credentials.set(request)
      case 'credentials.unset': return this.api.credentials.unset(request)
      case 'llm.providers': return this.api.llm.providers(request)
      case 'llm.models': return this.api.llm.models(request)
      case 'llm.discoverModels': return this.api.llm.discoverModels(request, signal)
    }
  }

  openMux(
    payload,
    signal,
    onOpen,
  ) {
    return this.tapStream(this.api.events.mux(rpcRequest(payload), signal), onOpen)
  }

  openHost(
    payload,
    signal,
    onOpen,
  ) {
    return this.tapStream(this.api.events.host(rpcRequest(payload), signal), onOpen)
  }

  async *tapStream(
    stream,
    onOpen,
  ) {
    onOpen?.()
    for await (const envelope of stream) {
      const full = { type: 'server-request', rpcId: envelope.rpcId, method: envelope.payload.type, payload: envelope.payload }
      this.onEnvelope(full)
      yield envelope
    }
  }

  async respond(message) {
    this.onEnvelope(message)
    return this.api.respond(message)
  }
}

function fixtureOptionsFromLocation() {
  if (typeof location === 'undefined') return {}
  const query = new URLSearchParams(location.search)
  return {
    empty: query.get('fixture') === 'empty',
    rejectPrompt: query.get('fixturePrompt') === 'reject',
    failWorkspaceAttach: query.get('fixtureAttach') === 'fail',
    dropSessionCreateResponse: query.get('fixtureSessionCreate') === 'drop-response',
    createFrameOrder: query.get('fixtureFrames') === 'workspace-first' ? 'workspace-first' : 'session-first',
  }
}
