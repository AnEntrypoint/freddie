import { createContext, runInContext, Script } from 'node:vm'
import { sandboxDefineTool, sandboxRegisterTool } from './guard.js'

export const HOST_BUILTIN_INSPECTION = [
  {
    name: 'ctx',
    description: 'Restricted Cordis Context. Prefer ctx.get(name) with an undefined check; use inject for hard dependencies.',
    signatures: [
      'ctx.get(name: string): unknown | undefined',
      'ctx.on(name: string, listener: Function): () => void',
      'ctx.provide(name: string, value: unknown): () => void',
      'ctx.effect(callback: Function, label?: string): () => void',
    ],
  },
  {
    name: 'harness',
    description: 'Host helpers for Package-private Client RPC and model-visible dynamic Tools.',
    signatures: [
      'harness.handle(method: string, handler: (args: JsonValue) => JsonValue | Promise<JsonValue>): () => void',
      'harness.defineTool(definition: ToolDefinition): ToolDefinition',
      'harness.registerTool(ctx: Context, tool: ToolDefinition): () => void',
    ],
  },
  { name: 'console', description: 'Package-tagged Host logging.', signatures: ['console.log(...values): void', 'console.error(...values): void'] },
  { name: 'btoa', description: 'Encode UTF-8 text as base64.', signatures: ['btoa(value: string): string'] },
  { name: 'atob', description: 'Decode base64 as UTF-8 text.', signatures: ['atob(value: string): string'] },
  { name: 'TextEncoder', description: 'Standard UTF-8 encoder constructor.', signatures: ['new TextEncoder()'] },
  { name: 'TextDecoder', description: 'Standard text decoder constructor.', signatures: ['new TextDecoder(label?: string)'] },
]

function taggedConsole(id) {
  const tag = `[cordis:${id}]`
  const log = (...args) => { console.log(tag, ...args) }
  const error = (...args) => { console.error(tag, ...args) }
  return { log, info: log, warn: log, debug: log, error }
}

const DUAL_REALM_INSTANCEOF_PRELUDE = `
(hostIntrinsics) => {
  'use strict'
  const ordinary = Function.prototype[Symbol.hasInstance]
  for (const name of Object.keys(hostIntrinsics)) {
    const VmCtor = globalThis[name]
    const HostCtor = hostIntrinsics[name]
    if (typeof VmCtor !== 'function' || typeof HostCtor !== 'function') continue
    Object.defineProperty(VmCtor, Symbol.hasInstance, {
      value: (instance) => ordinary.call(VmCtor, instance) || ordinary.call(HostCtor, instance),
      configurable: true,
    })
  }
}
`

function patchDualRealmInstanceof(sandbox) {
  const patch = runInContext(DUAL_REALM_INSTANCEOF_PRELUDE, sandbox)
  patch({ Object, Array, Function, Error, TypeError, RangeError, SyntaxError, Promise, RegExp, Date, Map, Set })
}

const TIMER_REDIRECT
  = 'Node timers are unavailable. Use the cordis timer service instead: declare inject: [\'timer\'] on your plugin '
    + 'and call ctx.timeout / ctx.interval after querying Host Service.listService for the exact overloads. '
    + 'Those calls are fiber effects, cleaned up automatically when stopped.'

const NODE_API_REDIRECTS = {
  require:
    'Node modules are unavailable. Use the cordis services on ctx instead — e.g. inject: [\'fs\'] for files, '
    + '[\'web\'] for HTTP, [\'bash\'] for processes; query Service.listService with cordis_inspect_query first.',
  setTimeout: TIMER_REDIRECT,
  setInterval: TIMER_REDIRECT,
  setImmediate: TIMER_REDIRECT,
  clearTimeout: TIMER_REDIRECT,
  clearInterval: TIMER_REDIRECT,
  fetch:
    'Network access goes through the cordis web service: declare inject: [\'web\'] and call ctx.web '
    + '(query Host Service.listService with cordis_inspect_query for its methods).',
}

function nodeApiTraps() {
  const traps = {}
  for (const [name, redirect] of Object.entries(NODE_API_REDIRECTS)) {
    traps[name] = () => {
      throw new Error(`${name} is not available in the dynamic package sandbox — ${redirect}`)
    }
  }
  return traps
}

export function createSandbox(id, harnessExtras = {}) {
  const sandbox = {
    ...nodeApiTraps(),
    console: taggedConsole(id),
    harness: { defineTool: sandboxDefineTool, registerTool: sandboxRegisterTool, ...harnessExtras },
    btoa: s => Buffer.from(s, 'utf-8').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('utf-8'),
    TextEncoder,
    TextDecoder,
  }
  createContext(sandbox)
  patchDualRealmInstanceof(sandbox)
  return sandbox
}

function isSyntaxError(error) {
  return typeof error === 'object' && error !== null && error.name === 'SyntaxError'
}

export function syntaxErrorContext(error) {
  const lines = (error.stack ?? '').split('\n')
  const messageIndex = lines.findIndex(line => line.startsWith('SyntaxError'))
  if (messageIndex === -1) return String(error)
  return lines.slice(0, messageIndex + 1).join('\n')
}

export function parseErrorMessage(half, context) {
  const offendingLine = context.split('\n')[1] ?? ''
  if (/\bas\b/.test(offendingLine)) {
    return `dynamic package \`${half}\` failed to parse:\n${context}\n`
      + 'The sandbox runs plain JavaScript, not TypeScript. Remove type annotations:\n'
      + '  ✗ { type: \'text\' as const, text: x }\n'
      + '  ✓ { type: \'text\', text: x }'
  }
  return `dynamic package \`${half}\` failed to parse:\n${context}\n`
    + 'Note: it runs as the BODY of an async function (line numbers are offset by the 1-line wrapper). '
    + 'Check bracket balance — ending the returned plugin object with `});` closes a call that was never opened; '
    + 'a plain `return { … }` ends with `}` (an optional `;`), never `)`.'
}

export function precheckCode(code, half) {
  const wrapped = `(async () => {\n${code}\n})()`
  try {
    new Function(wrapped)
  } catch (error) {
    if (!isSyntaxError(error)) throw error
    throw new Error(parseErrorMessage(half, prettyParseContext(wrapped, half, error)))
  }
}

function prettyParseContext(wrapped, half, refusal) {
  try {
    new Script(wrapped, { filename: `cordis-dyn-${half}.js` })
  } catch (vmError) {
    if (isSyntaxError(vmError)) return syntaxErrorContext(vmError)
  }
  return String(refusal)
}

export async function evaluateHostCode(sandbox, code, id, vmTimeoutMs) {
  try {
    return await runInContext(
      `(async () => {\n${code}\n})()`,
      sandbox,
      { filename: `cordis-dyn-${id}.js`, timeout: vmTimeoutMs },
    )
  } catch (error) {
    if (!isSyntaxError(error)) throw error
    throw new Error(parseErrorMessage('code.host', syntaxErrorContext(error)))
  }
}
