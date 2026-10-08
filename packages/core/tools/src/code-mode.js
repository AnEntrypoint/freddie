import { CallId, createUserMessage, HarnessError } from '@freddie/freddie-llm'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { defineTool, parameterSchemaSpecToJsonSchema } from './schema.js'
import { TOOL_RUNTIME_SCHEDULER } from './index.js'

export const RUN_CODE_NAME = 'run_code'

export const SDK_SECTION_ORDER = 150

const TYPESCRIPT_FLAVOR = {
  description:
    'Execute a TypeScript program against the available tools. Takes two required '
    + 'arguments: `code`, the BODY of an async function (erasable syntax only; top-level '
    + '`await` and `return` work), and `description`, a short summary of what the program '
    + 'does. Call tools as `await tools.name(args)` per the declarations in the system '
    + 'prompt. Only what you print or return is program output — curate it. Image-bearing '
    + 'subtool results are attached after the run.',
  codeDescription: 'The program: the body of an async TypeScript function.',
}

const PYTHON_FLAVOR = {
  description:
    'Execute a Python program against the available tools. Takes two required '
    + 'arguments: `code`, the BODY of an async function (top-level `await` and `return` '
    + 'work), and `description`, a short summary of what the program does. Call tools as '
    + '`await tools.name(args)` per the declarations in the system prompt. Use '
    + '`print(...)` and/or `return <value>` for program output — curate it. Image-bearing '
    + 'subtool results are attached after the run.',
  codeDescription: 'The program: the body of an async Python function.',
}



const RUN_CODE_FLAVORS = {
  typescript: TYPESCRIPT_FLAVOR,
  python: PYTHON_FLAVOR,
}

const RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
  = 'Clear, concise description of what this program does in active voice, '
    + '5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; '
    + '"Read failing test and its fixture"; "Rename config key in every cordis.yml".'

function resolveFlavor(peekRuntime) {
  const runtime = peekRuntime()
  if (runtime === undefined) {
    return TYPESCRIPT_FLAVOR
  }
  const flavor = RUN_CODE_FLAVORS[runtime.language]
  if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language) || flavor === undefined) {
    const known = Object.keys(RUN_CODE_FLAVORS).map(name => JSON.stringify(name)).join(', ')
    throw new Error(`freddie-tools: no run_code schema flavor registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`)
  }
  return flavor
}

export class CodeRunFailedError extends HarnessError {
  constructor(message) {
    super(message, 'CODE_RUN_FAILED')
    this.name = 'CodeRunFailedError'
  }
}

function jsonNormalizeArgs(value) {
  let snapshot
  try {
    snapshot = snapshotJsonValue(value)
  } catch (error) {
    throw new Error(`tool arguments must be lossless JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (snapshot === undefined) {
    throw new Error('tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)')
  }
  const logged = snapshotJsonValue(snapshot)
  if (logged === undefined) {
    throw new Error('tool arguments could not be detached for durable logging')
  }
  return { dispatched: snapshot, logged }
}

const JSON_INDENT = '  '

const MAX_JSON_INDENT_CHARS = 10

function renderJsonValue(value) {
  const chunks = []
  const tasks = [{ kind: 'value', value, depth: 0, compact: false }]
  for (let task = tasks.pop(); task !== undefined; task = tasks.pop()) {
    if (task.kind === 'text') {
      chunks.push(task.text)
      continue
    }

    const current = task.value
    if (current === null || typeof current === 'boolean' || typeof current === 'number') {
      chunks.push(String(current))
      continue
    }
    if (typeof current === 'string') {
      chunks.push(JSON.stringify(current))
      continue
    }

    const compact = task.compact || (task.depth + 1) * JSON_INDENT.length > MAX_JSON_INDENT_CHARS
    const childDepth = task.depth + 1
    if (Array.isArray(current)) {
      chunks.push('[')
      if (current.length === 0) {
        chunks.push(']')
        continue
      }
      tasks.push({ kind: 'text', text: compact ? ']' : `\n${JSON_INDENT.repeat(task.depth)}]` })
      for (let index = current.length - 1; index >= 0; index--) {
        const item = current[index]
        if (item === undefined) throw new Error('cannot render a sparse JSON array')
        tasks.push({ kind: 'value', value: item, depth: childDepth, compact })
        tasks.push({
          kind: 'text',
          text: compact
            ? index === 0 ? '' : ','
            : `${index === 0 ? '\n' : ',\n'}${JSON_INDENT.repeat(childDepth)}`,
        })
      }
      continue
    }

    const keys = Object.keys(current)
    chunks.push('{')
    if (keys.length === 0) {
      chunks.push('}')
      continue
    }
    tasks.push({ kind: 'text', text: compact ? '}' : `\n${JSON_INDENT.repeat(task.depth)}}` })
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]
      if (key === undefined) throw new Error('cannot render a missing JSON object key')
      const item = current[key]
      if (item === undefined) throw new Error('cannot render an undefined JSON object property')
      tasks.push({ kind: 'value', value: item, depth: childDepth, compact })
      tasks.push({
        kind: 'text',
        text: compact
          ? `${index === 0 ? '' : ','}${JSON.stringify(key)}:`
          : `${index === 0 ? '\n' : ',\n'}${JSON_INDENT.repeat(childDepth)}${JSON.stringify(key)}: `,
      })
    }
  }
  return chunks.join('')
}

function renderValue(value) {
  return typeof value === 'string' ? value : renderJsonValue(value)
}

export function createRunCodeTool(registry, options) {
  const { requireRuntime, peekRuntime, maxParallel, shapeDispatchLog } = options
  const definition = defineTool({
    name: RUN_CODE_NAME,
    description: TYPESCRIPT_FLAVOR.description,
    parameters: {
      code: { type: 'string', required: true, description: TYPESCRIPT_FLAVOR.codeDescription },
      description: {
        type: 'string',
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          logs: { type: 'array', required: true, items: { type: 'string' } },
          result: { type: 'json' },
        },
      },
      render: (_args, value) => {
        const rendered = value.result === undefined ? '' : renderValue(value.result)
        const parts = [value.logs.join('\n'), rendered].filter(part => part.length > 0)
        return [{ type: 'text', text: parts.length > 0 ? parts.join('\n') : '(run_code completed with no output)' }]
      },
    },
    async execute(args, exec) {
      if (args.description.trim().length === 0) {
        throw new Error('invalid description: expected a non-empty string')
      }
      const runtime = requireRuntime()

      const runController = new AbortController()
      const onOuterAbort = () => { runController.abort(exec.signal.reason) }
      exec.signal.addEventListener('abort', onOuterAbort, { once: true })

      let dispatches = 0
      const pendingQueue = []
      const inFlight = new Set()
      const logWork = new Set()
      const commitQueue = []
      let exclusiveActive = false
      let driving = false
      let driverRun = Promise.resolve()
      let wake
      const wakeup = () => {
        const release = wake
        wake = undefined
        release?.()
      }
      const drive = () => {
        if (driving) return driverRun
        driving = true
        driverRun = (async () => {
          try {
            for (;;) {
              const signal = new Promise((resolve) => { wake = resolve })
              const commitHead = commitQueue[0]
              if (commitHead !== undefined && commitHead.settled) {
                commitQueue.shift()
                await commitHead.commit()
                if (commitHead.mode === 'exclusive') exclusiveActive = false
                continue
              }
              const head = pendingQueue[0]
              if (head !== undefined) {
                if (runController.signal.aborted) {
                  pendingQueue.shift()
                  head.abandon()
                  continue
                }
                const mode = head.classify()
                const capacity = !exclusiveActive
                  && (mode === 'exclusive' ? inFlight.size === 0 : inFlight.size < maxParallel)
                if (capacity) {
                  if (mode === 'exclusive') exclusiveActive = true
                  head.mode = mode
                  pendingQueue.shift()
                  commitQueue.push(head)
                  await head.start()
                  const flight = head.flight.finally(() => {
                    inFlight.delete(flight)
                    wakeup()
                  })
                  inFlight.add(flight)
                  continue
                }
              }
              if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0) return
              await signal
            }
          } finally {
            driving = false
            wake = undefined
          }
        })()
        return driverRun
      }
      const drainDispatches = async () => {
        await drive()
        while (logWork.size > 0) await Promise.allSettled([...logWork])
      }

      const runOver = () => runController.signal.aborted

      const binding = name => async (rawArgs) => {
        if (runOver()) {
          throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} not dispatched`)
        }
        const normalized = jsonNormalizeArgs(rawArgs)
        const n = ++dispatches
        const subCallId = CallId(`${String(exec.callId)}:code:${n}`)
        const input = {
          callId: subCallId,
          rootCallId: exec.rootCallId,
          name,
          arguments: normalized.dispatched,
          ...exec.agent ? { agent: exec.agent } : {},
          parent: exec.token,
          signal: runController.signal,
        }
        const scheduler = registry[TOOL_RUNTIME_SCHEDULER]
        const outcome = await new Promise((resolve, reject) => {
          let parked
          const settle = (result) => {
            resolve(result.isError
              ? { isError: true, message: result.error.message }
              : { isError: false, value: result.value })
            const agent = exec.agent
            if (agent === undefined) return
            const task = (async () => {
              const logged = await shapeDispatchLog({
                exec, agent, subCallId, name, isError: result.isError,
                content: result.content,
              })
              agent.session.append('tool/code-dispatch', {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name,
                arguments: normalized.logged,
                isError: result.isError,
                content: logged,
              })
            })().finally(() => { logWork.delete(task) })
            logWork.add(task)
          }
          pendingQueue.push({
            flight: Promise.resolve(),
            settled: false,
            classify: () => registry.executionMode(input).kind,
            abandon: () => {
              reject(new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} tool call abandoned`))
            },
            async start() {
              exec.agent?.session.append('tool/code-dispatch-start', {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name,
                arguments: normalized.logged,
              })
              const prepared = await scheduler.prepare(input)
              if (prepared.kind === 'dispatch') {
                this.flight = scheduler.dispatch(prepared.exec).then((dispatchOutcome) => {
                  parked = { kind: dispatchOutcome.kind, exec: prepared.exec, result: dispatchOutcome.result }
                  this.settled = true
                })
                return
              }
              parked = { kind: prepared.kind, exec: prepared.exec, result: prepared.result }
              this.settled = true
            },
            async commit() {
              if (parked === undefined) return
              const result = parked.kind === 'post-result'
                ? await scheduler.finalize(parked.exec, parked.result)
                : scheduler.finish(parked.exec, parked.result)
              if (!result.isError && result.content.some(block => block.type === 'image')) {
                exec.deferContext(createUserMessage({
                  content: result.content,
                  source: { kind: 'plugin', plugin: 'tools-code-mode' },
                }))
              }
              for (const context of result.additionalContexts ?? []) {
                exec.deferContext(context)
              }
              if (result.concludesTurn) exec.concludeTurn()
              settle(result)
              while (logWork.size > maxParallel) await Promise.race(logWork)
            },
          })
          wakeup()
          void drive()
        })
        if (runOver()) {
          throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} result discarded`)
        }
        if (outcome.isError) throw new Error(outcome.message)
        return outcome.value
      }

      const functions = Object.create(null)
      for (const schema of registry.schemas(exec.agent)) {
        if (schema.name === RUN_CODE_NAME) continue
        Object.defineProperty(functions, schema.name, { enumerable: true, value: binding(schema.name) })
      }

      try {
        let result
        try {
          result = await runtime.run({
            program: args.code,
            bindings: [{
              global: 'tools',
              functions,
              errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' },
            }],
            signal: runController.signal,
          })
        } finally {
          runController.abort('run_code settled')
          await drainDispatches()
        }

        if (result.error) {
          const logsText = result.logs.length > 0 ? `\nCaptured output:\n${result.logs.join('\n')}` : ''
          throw new CodeRunFailedError(`code run failed (${result.error.kind}): ${result.error.message}${logsText}`)
        }
        return {
          logs: result.logs,
          ...result.value !== undefined ? { result: result.value } : {},
        }
      } finally {
        exec.signal.removeEventListener('abort', onOuterAbort)
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: args.description,
      kind: 'execute',
      rawInput: args.code,
    }),
  })
  Object.defineProperty(definition, 'description', {
    enumerable: true,
    get: () => resolveFlavor(peekRuntime).description,
  })
  Object.defineProperty(definition, 'parameters', {
    enumerable: true,
    get: () => parameterSchemaSpecToJsonSchema({
      code: { type: 'string', required: true, description: resolveFlavor(peekRuntime).codeDescription },
      description: { type: 'string', required: true, description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION },
    }),
  })
  return definition
}
