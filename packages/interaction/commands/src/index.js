import { Context } from '@freddie/cordis'
import { AttachmentError, admitEncodedImages } from '@freddie/freddie-attachment'
import { NamedEntries, ScopedLayers } from '@freddie/freddie-scope'
import { TypertRemoteService, Remote } from '@freddie/freddie-typert-protocol'
import { CommandId } from './brand.js'

export { CommandId } from './brand.js'

export const name = 'commands'

const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u

const NO_ATTACHMENTS = Object.freeze([])

class CommandLayer {
  commands

  constructor(scope) {
    this.commands = new NamedEntries(name => new Error(scope === undefined
      ? `command "${name}" is already registered (for a per-agent variant, mount a command-injected plugin under that agent's \`agent.ctx\`)`
      : `command "${name}" is already registered in this scope`))
  }

  isEmpty() {
    return this.commands.isEmpty()
  }
}

export function parseCommand(line) {
  const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line)
  if (match === null) return undefined
  const name = match[1]
  if (name === undefined) return undefined
  return Object.freeze({ name, rawInput: line.slice(match[0].length) })
}

function abortError(signal) {
  if (signal.reason instanceof Error) return signal.reason
  return new Error(typeof signal.reason === 'string' ? signal.reason : 'command aborted')
}

function cancellationOf(signal) {
  return signal.aborted ? abortError(signal) : undefined
}

function renderThrown(value) {
  try {
    return String(value)
  } catch {
    return '<unrenderable thrown value>'
  }
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(abortError(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error
          ? error
          : new Error(`command handler rejected with a non-Error value: ${renderThrown(error)}`, { cause: error }))
      },
    )
  })
}

function normalizeDefinition(definition) {
  if (!COMMAND_NAME.test(definition.name)) {
    throw new TypeError(`command name "${definition.name}" must match ${String(COMMAND_NAME)}`)
  }
  if (typeof definition.description !== 'string') {
    throw new TypeError(`command "${definition.name}" description must be a string`)
  }
  if (definition.description.trim().length === 0) {
    throw new TypeError(`command "${definition.name}" description must not be empty`)
  }
  if (typeof definition.handler !== 'function') {
    throw new TypeError(`command "${definition.name}" handler must be a function`)
  }
  const rawInput = definition.input
  let input
  if (rawInput !== undefined) {
    if (typeof rawInput !== 'object' || rawInput === null || !('hint' in rawInput)
      || typeof rawInput.hint !== 'string') {
      throw new TypeError(`command "${definition.name}" input hint must be a string`)
    }
    if (rawInput.hint.trim().length === 0) {
      throw new TypeError(`command "${definition.name}" input hint must not be empty`)
    }
    if ('images' in rawInput && rawInput.images !== undefined && typeof rawInput.images !== 'boolean') {
      throw new TypeError(`command "${definition.name}" input images flag must be a boolean`)
    }
    input = Object.freeze({
      hint: rawInput.hint,
      ...('images' in rawInput && rawInput.images === true) ? { images: true } : {},
    })
  }
  const normalized = Object.freeze({
    name: definition.name,
    description: definition.description,
    ...input === undefined ? {} : { input },
    ...definition.recordInput === undefined ? {} : { recordInput: definition.recordInput },
    handler: definition.handler,
  })
  const descriptor = Object.freeze({
    name: normalized.name,
    description: normalized.description,
    ...normalized.input === undefined ? {} : { input: normalized.input },
  })
  return { definition: normalized, descriptor }
}

function normalizeResult(command, value) {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new TypeError(`command "${command}" handler must return a CommandResult`)
  }
  const result = value
  if (result.kind === 'success') {
    if (result.text !== undefined && typeof result.text !== 'string') {
      throw new TypeError(`command "${command}" success text must be a string when supplied`)
    }
    if (result.sourceEventSeq !== undefined
      && (!Number.isSafeInteger(result.sourceEventSeq) || result.sourceEventSeq < 0)) {
      throw new TypeError(`command "${command}" success sourceEventSeq must be a non-negative safe integer when supplied`)
    }
    return Object.freeze({
      kind: 'success',
      ...result.text === undefined ? {} : { text: result.text },
      ...result.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.sourceEventSeq },
    })
  }
  if (result.kind === 'error') {
    if (typeof result.text !== 'string' || result.text.trim().length === 0) {
      throw new TypeError(`command "${command}" error text must be a non-empty string`)
    }
    return Object.freeze({ kind: 'error', text: result.text })
  }
  throw new TypeError(`command "${command}" returned unknown result kind "${String(result.kind)}"`)
}

export class CommandRuntime extends TypertRemoteService {
  layers = new ScopedLayers(
    scope => new CommandLayer(scope),
    () => { this.notifyChange() },
  )

  commandSeq = 0
  instanceToken = crypto.randomUUID().slice(0, 8)

  constructor(ctx) {
    super(ctx, 'commands')
  }

  register(definition) {
    const registered = normalizeDefinition(definition)
    return this.layers.effect(
      this.ctx,
      layer => layer.commands.insert(registered.definition.name, registered),
      { label: 'commands.register()' },
    )
  }

  list(agent) {
    return Object.freeze([...this.view(agent).values()]
      .map(command => command.descriptor)
      .sort((left, right) => left.name < right.name ? -1 : 1))
  }

  find(agent, name) {
    return this.view(agent).get(name)?.definition
  }

  async execute(
    agent,
    line,
    images,
    signal,
  ) {
    const parsed = parseCommand(line)
    if (parsed === undefined) return undefined
    const command = this.view(agent).get(parsed.name)
    if (command === undefined) return undefined
    if (signal.aborted) throw abortError(signal)
    const commandId = this.mintCommandId()
    this.appendLifecycle(agent.session, 'command/run', {
      commandId,
      name: parsed.name,
      ...command.definition.recordInput === false ? {} : { args: parsed.rawInput },
      source: { kind: 'user' },
    })
    const settle = (result) => {
      this.appendLifecycle(agent.session, 'command/done', {
        commandId, kind: result.kind,
        ...result.text === undefined ? {} : { text: result.text },
        ...result.kind === 'success' && result.sourceEventSeq !== undefined
          ? { sourceEventSeq: result.sourceEventSeq }
          : {},
      })
      return Object.freeze({ commandId, result: Object.freeze(result) })
    }
    let attachments = NO_ATTACHMENTS
    if (images.length > 0) {
      if (command.definition.input?.images !== true) {
        return settle({ kind: 'error', text: `/${parsed.name} does not accept image attachments` })
      }
      const store = this.ctx.get('attachments')
      if (store === undefined) {
        return settle({ kind: 'error', text: `/${parsed.name}: image attachments are unavailable because no attachment store is composed` })
      }
      try {
        const refs = await admitEncodedImages(store, images)
        attachments = Object.freeze(refs.map(ref => Object.freeze({ type: 'image', attachment: ref })))
      } catch (error) {
        if (error instanceof AttachmentError) {
          return settle({ kind: 'error', text: error.message })
        }
        this.settleThrown(agent.session, parsed.name, commandId, error)
        throw error
      }
      const cancelledDuringAdmission = cancellationOf(signal)
      if (cancelledDuringAdmission !== undefined) {
        this.settleThrown(agent.session, parsed.name, commandId, cancelledDuringAdmission)
        throw cancelledDuringAdmission
      }
    }
    const invocation = Object.freeze({ commandId, agent, rawInput: parsed.rawInput, attachments, signal })
    let result
    try {
      const output = command.definition.handler(invocation)
      result = normalizeResult(parsed.name, await withAbort(Promise.resolve(output), signal))
    } catch (error) {
      this.settleThrown(agent.session, parsed.name, commandId, error)
      throw error
    }
    return settle(result)
  }

  settleThrown(session, command, commandId, error) {
    try {
      this.appendLifecycle(session, 'command/done', {
        commandId, kind: 'error',
        text: error instanceof Error ? error.message : renderThrown(error),
      })
    } catch (appendError) {
      this.ctx.logger.warn(`command "${command}": command/done append failed: ${renderThrown(appendError)}`)
    }
  }

  mintCommandId() {
    this.commandSeq += 1
    return CommandId(`cmd-${this.instanceToken}-${this.commandSeq}`)
  }

  appendLifecycle(session, type, data) {
    const appendLogOnly = session.append.bind(session)
    return appendLogOnly(type, data)
  }

  view(agent) {
    return this.layers.merge(agent, layer => layer.commands)
  }

  notifyChange() {
    for (const callback of this.ctx.events.dispatch('emit', ['commands/change'])) {
      try {
        const returned = callback()
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`commands/change listener rejected: ${renderThrown(error)}`)
        })
      } catch (error) {
        this.ctx.logger.warn(`commands/change listener threw: ${renderThrown(error)}`)
      }
    }
  }
}
Remote(CommandRuntime.prototype.list, {
  name: 'list',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(CommandRuntime.prototype)) },
})
Remote(CommandRuntime.prototype.execute, {
  name: 'execute',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(CommandRuntime.prototype)) },
})

export default CommandRuntime
