import { randomUUID } from 'node:crypto'

const PROCESS_INSTANCE_ID = randomUUID()
import { mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { installModelSelection } from '@freddie/freddie-agent'
import { AttachmentError, admitEncodedImages } from '@freddie/freddie-attachment'
import { createUserMessage, freezeMessage, ReasoningEffortId } from '@freddie/freddie-llm'
import { errorChain } from '@freddie/freddie-llm'
import { isAppendSurfaceEvent, isJsonValue } from '@freddie/freddie-session'
import { SessionQueryError } from '@freddie/freddie-session-query'
import { SubagentError } from '@freddie/freddie-subagent'
import { TerminalError, TerminalSessionId } from '@freddie/freddie-terminal'
import { isUserInvocable } from '@freddie/freddie-skill'
import { canonicalClientTimeZone } from '@freddie/freddie-time'
import {
  workspaceDomainState, workspaceRecord, WorkspaceId as brandWorkspaceId,
  WorkspaceMoveInvalidError, WorkspaceOrderInvalidError, WorkspaceUnknownSessionError,
} from '@freddie/freddie-workspace'
import {
  InvalidPresetIdError, PresetExistsError, PresetMountError,
  PresetNotWritableError, resolveSessionPreset, UnknownPresetError,
} from '@freddie/freddie-agent-presets'
import {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
  flushLiveSessionLog,
  sessionLogExportDeps,
  sessionLogZipFilename,
  streamSessionLogZip,
} from './session-export.js'
import {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
  truncateUnicodeCodePoints,
} from './api/session-search.js'
import { GoalError } from '@freddie/freddie-goal'
import { SettingsConflictError, settingsNamespace } from '@freddie/freddie-settings'
import { credentialRef } from '@freddie/freddie-credentials'
import { SessionTitleInvalidError } from '@freddie/freddie-session-title'
import { toApprovalResponsePayload } from './api/approvals.schema.js'
import { RpcId } from './api/rpc.js'
import { UserQuestionError } from '@freddie/freddie-user-questions'
import { DirectoryPickerError } from '@freddie/freddie-host-directory-picker'
import {
  ApiRemoteSessionNotFound as SessionNotFound,
  ApiRemoteSubagentSessionOwnership as SubagentSessionOwnership,
  API_REMOTE_FORWARDED_EVENTS,
  apiRemoteSubagentOwnershipError,
  createApiRemoteAgentResolver,
  hasApiRemoteSubagentOwner,
  inspectApiRemoteSession,
} from '@freddie/freddie-api-remotes'
import { canOpenNativePath, openNativePath, openNativeTextFile } from './native-path-opener.js'

const DEFAULT_MAX_MESSAGES = 50

const SESSION_SEARCH_PROVIDER_CALL_LIMIT = 100

const COLD_SUMMARY_BATCH_SIZE = 16
export const DEFAULT_COLD_BLANK_PROBE_MAX_BYTES = 1024
export const DEFAULT_MAX_MUX_BUFFERED_FRAMES = 1_000
export const DEFAULT_MAX_MUX_BUFFERED_BYTES = 1_048_576

const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])

async function durablePromptContent(ctx, content) {
  if (content.every(part => part.type === 'text')) {
    return content.map(part => ({ type: 'text', text: part.text }))
  }
  const refs = await admitEncodedImages(ctx.attachments, content.filter(part => part.type === 'image'))
  let next = 0
  return content.map(part => part.type === 'text'
    ? { type: 'text', text: part.text }
    : { type: 'image', attachment: refs[next++] })
}

function imageBlockIn(content, match) {
  if (!Array.isArray(content)) return undefined
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment
      if (match(ref)) return ref
    }
    if (block.type === 'tool-result') {
      const nested = imageBlockIn(block.content, match)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

function imageInEvent(event, match) {
  const data = event.data
  const direct = imageBlockIn(data.content, match)
  if (direct !== undefined) return direct
  if (data.message !== undefined) {
    const wrapped = imageBlockIn(data.message.content, match)
    if (wrapped !== undefined) return wrapped
  }
  if (data.inserted !== undefined) {
    for (const message of data.inserted) {
      const inserted = imageBlockIn(message.content, match)
      if (inserted !== undefined) return inserted
    }
  }
  if (event.type === 'assistant/chunk' && data.chunk?.type === 'block-end') {
    return imageBlockIn([data.chunk.block], match)
  }
  return undefined
}

function referencedImage(events, attachmentId) {
  for (const event of events) {
    const found = imageInEvent(event, ref => String(ref.attachmentId) === attachmentId)
    if (found !== undefined) return found
  }
  return undefined
}

function isAborted(signal) {
  return signal.aborted
}

function paginate(events, beforeSeq, maxMessages) {
  const window = beforeSeq === undefined ? [...events] : events.filter(event => event.seq < beforeSeq)
  let count = 0
  let cut = 0
  for (let i = window.length - 1; i >= 0; i--) {
    const event = window[i]
    if (!MESSAGE_TYPES.has(event.type) || !isAppendSurfaceEvent(event)) continue
    count++
    const sources = event.sourceEventSeqs
    let groupStart = event.seq
    if (sources !== undefined) {
      for (const source of sources) {
        if (source < groupStart) groupStart = source
      }
    }
    if (count >= maxMessages) {
      cut = groupStart
      break
    }
  }
  const page = window.filter(event => event.seq >= cut)
  return { events: page, hasMore: cut > 0 }
}

function ok(request, value) {
  return { rpcId: request.rpcId, result: { ok: true, value } }
}

async function buildModelCatalog(ctx) {
  const catalog = await Promise.all(ctx.llm.listProviders().map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async (model) => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        const reasoning = resolved.reasoning === undefined
          ? undefined
          : {
            efforts: resolved.reasoning.efforts.map(effort => ({
              id: effort.id,
              name: effort.name,
              ...effort.description === undefined
                ? {}
                : { description: effort.description },
            })),
            ...resolved.reasoning.defaultEffort === undefined
              ? {}
              : { defaultEffort: resolved.reasoning.defaultEffort },
          }
        return {
          id: model.id,
          name: model.name,
          ...model.description === undefined ? {} : { description: model.description },
          ...reasoning === undefined ? {} : { reasoning },
        }
      }))
      const group = {
        id: provider.id,
        name: provider.name,
        models: entries,
      }
      return { kind: 'group', group }
    } catch (error) {
      const failure = {
        id: provider.id,
        name: provider.name,
        message: error instanceof Error ? error.message : String(error),
      }
      return { kind: 'failure', failure }
    }
  }))
  return {
    groups: catalog.flatMap(item => item.kind === 'group' ? [item.group] : []).filter(group => group.models.length > 0),
    failures: catalog.flatMap(item => item.kind === 'failure' ? [item.failure] : []),
  }
}

function err(request, error) {
  return { rpcId: request.rpcId, result: { ok: false, error } }
}

function badRequest(request, message) {
  return err(request, { code: 'bad-request', message, details: { issues: [] } })
}

function requireNonEmptyString(request, value, message) {
  if (typeof value !== 'string' || value.length === 0) return badRequest(request, message)
}

function presetFailure(request, error) {
  if (error instanceof UnknownPresetError) {
    return err(request, {
      code: 'agent-preset-not-found',
      message: error.message,
      details: { agentPreset: error.presetId, available: [...error.available] },
    })
  }
  if (error instanceof PresetMountError) {
    return err(request, {
      code: 'agent-preset-invalid',
      message: error.message,
      details: { agentPreset: error.presetId, reason: error.reason },
    })
  }
  return undefined
}

const frameByteSizes = new WeakMap()

function frameBytes(item) {
  const cached = frameByteSizes.get(item)
  if (cached !== undefined) return cached
  const bytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
  frameByteSizes.set(item, bytes)
  return bytes
}

class FrameQueue {
  buffer = []
  bufferedBytes = 0
  waiter
  done = false
  overflowed = false
  maxFrames
  maxBytes

  constructor({ maxFrames, maxBytes }) {
    this.maxFrames = maxFrames
    this.maxBytes = maxBytes
  }

  push(item) {
    if (this.done) return false
    const bytes = frameBytes(item)
    if (this.buffer.length >= this.maxFrames || this.bufferedBytes + bytes > this.maxBytes) {
      this.overflowed = true
      this.buffer.length = 0
      this.bufferedBytes = 0
      this.end()
      return false
    }
    this.buffer.push({ item, bytes })
    this.bufferedBytes += bytes
    this.waiter?.()
    return true
  }

  end() {
    this.done = true
    this.waiter?.()
  }

  async *iterate(signal, cleanup) {
    const onAbort = () => { this.end() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (true) {
        while (this.buffer.length > 0) {
          const next = this.buffer.shift()
          this.bufferedBytes -= next.bytes
          yield next.item
        }
        if (this.done || signal.aborted) return
        await new Promise((resolve) => { this.waiter = resolve })
        this.waiter = undefined
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      cleanup()
    }
  }
}

function frame(payload) {
  return { rpcId: RpcId(randomUUID()), payload }
}

export function assertJsonArgs(event, args) {
  for (const [index, arg] of args.entries()) {
    if (!isJsonValue(arg)) {
      throw new Error(`forwarded host event "${event}" argument ${index} is not lossless JSON data`)
    }
  }
  return args
}

function subscribeSession(queue, session) {
  queue.push(frame({ type: 'session/subscribed', sessionId: session.id, lastSeq: session.seq - 1 }))
}

function jobViews(snapshots) {
  return snapshots.map(job => ({
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    ...job.detail === undefined ? {} : { detail: job.detail },
    startedAt: job.startedAt,
    ...job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt },
  }))
}

function sessionBlank(session) {
  return !session.events.some(event => event.type === 'turn/start')
}

function applySessionListMetadata(state, event) {
  const blank = state.blank && event.type !== 'turn/start'
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  const errored = event.type === 'turn/start'
    ? false
    : event.type === 'turn/end'
      ? event.data.reason.kind === 'error'
      : state.errored
  return blank === state.blank && lastPromptAt === state.lastPromptAt && errored === state.errored
    ? state
    : { blank, lastPromptAt, errored }
}

function sessionListMetadata(events) {
  let state = { blank: true, lastPromptAt: null, errored: false }
  for (const event of events) state = applySessionListMetadata(state, event)
  return state
}

function sessionListUpdatedAt(header, metadata) {
  return Math.max(header.createdAt, metadata?.lastPromptAt ?? 0)
}

function sessionListFields(header, events = []) {
  const agentPreset = resolveSessionPreset({ header, events })
  return {
    ...header.parentSession === undefined ? {} : { parentSessionId: header.parentSession },
    ...header.origin === undefined ? {} : { origin: header.origin },
    ...header.cwd === undefined ? {} : { cwd: header.cwd },
    ...agentPreset === undefined ? {} : { agentPreset },
  }
}

function summarize(session, running) {
  const metadata = sessionListMetadata(session.events)
  return {
    sessionId: session.id,
    updatedAt: sessionListUpdatedAt(session.header, metadata),
    running,
    blank: metadata.blank,
    errored: !running && metadata.errored,
    ...sessionListFields(session.header, session.events),
  }
}

async function probeColdSessionMetadata(ctx, persistence, meta, maxBytes, signal) {
  if (maxBytes === 0) return undefined
  signal?.throwIfAborted()
  const location = persistence.locate(meta)
  if (location === undefined) return undefined
  signal?.throwIfAborted()
  let size
  try {
    size = (await stat(location.path)).size
  } catch {
    signal?.throwIfAborted()
    return undefined
  }
  if (size > maxBytes) return undefined
  try {
    const { events } = await persistence.readFrom(meta.id, 0, signal)
    signal?.throwIfAborted()
    return sessionListMetadata(events)
  } catch (error) {
    signal?.throwIfAborted()
    ctx.logger.warn(`session.list: blank probe for "${meta.id}" failed (serving it as visible): ${String(error)}`)
    return undefined
  }
}

async function summarizeCold(ctx, persistence, meta, metadata, blankProbeMaxBytes, signal) {
  const probed = metadata?.blank === false
    ? undefined
    : await probeColdSessionMetadata(ctx, persistence, meta, blankProbeMaxBytes, signal)
  return {
    sessionId: meta.id,
    updatedAt: sessionListUpdatedAt(meta, probed ?? metadata),
    running: false,
    blank: metadata?.blank === false ? false : probed?.blank ?? false,
    errored: metadata?.errored ?? probed?.errored ?? false,
    agentAvailable: false,
    ...sessionListFields(meta),
  }
}

function directoryError(error) {
  if (error instanceof DirectoryPickerError) {
    return { code: error.code, message: error.message, details: { path: error.path } }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

function requestedFrame(pending) {
  return {
    rpcId: pending.rpcId,
    payload: {
      type: 'approval/requested',
      sessionId: pending.sessionId,
      approvalId: pending.approvalId,
      toolName: pending.toolName,
      ...pending.callId === undefined ? {} : { callId: pending.callId },
      ...pending.reason === undefined ? {} : { reason: pending.reason },
    },
  }
}

function matchesQuestions(payload, pending) {
  if (payload.sessionId !== pending.sessionId) return false
  const answers = payload.answer.answers
  if (answers.length !== pending.questions.length) return false
  return answers.every((answer, index) => {
    const question = pending.questions[index]
    if (answer.id !== question.id) return false
    if (new Set(answer.selected).size !== answer.selected.length) return false
    const custom = answer.custom?.trim()
    if (custom !== undefined && custom === '') return false
    if (question.multiSelect !== true) {
      if (custom !== undefined && answer.selected.length > 0) return false
      if (answer.selected.length > 1) return false
    }
    const labels = new Set(question.options?.map(option => option.label) ?? [])
    return answer.selected.every(label => labels.has(label))
  })
}

function viewFor(
  ctx,
  event,
  argsFor,
  scope,
) {
  try {
    if (event.type === 'tool/call') {
      const { name, arguments: raw } = event.data
      const view = ctx.tools.get(name, scope)?.presentCall?.(JSON.parse(raw))
      return view === undefined ? undefined : { for: 'call', view }
    }
    if (event.type === 'tool/result') {
      const { message, meta } = event.data
      const [result] = message.content
      const callId = message.source.callId
      const call = argsFor(callId)
      if (call === undefined) return undefined
      const view = ctx.tools.get(call.name, scope)?.presentResult?.(call.args, {
        content: result.content,
        isError: result.isError === true,
        ...meta === undefined ? {} : { meta },
      })
      return view === undefined ? undefined : { for: 'result', view }
    }
  } catch (error) {
    console.error(`api-proxy: presenter failed for ${event.type}, falling back to generic: ${String(error)}`)
  }
  return undefined
}

function backscanArgs(events, callId) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'tool/call') continue
    const data = event.data
    if (data.callId !== callId) continue
    try {
      return { name: data.name, args: JSON.parse(data.arguments) }
    } catch {
      return undefined
    }
  }
  return undefined
}

function historyPage(ctx, events, beforeSeq, maxMessages, scope) {
  const page = paginate(events, beforeSeq, maxMessages ?? DEFAULT_MAX_MESSAGES)
  return {
    events: page.events.map((event) => {
      const view = viewFor(ctx, event, callId => backscanArgs(page.events, callId), scope)
      return { event, ...view === undefined ? {} : { view } }
    }),
    hasMore: page.hasMore,
  }
}

function projectionsFor(ctx, session) {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) return undefined
  return registry.snapshot(session)
}

function listProjectionsFor(ctx, meta, session) {
  try {
    const block = session !== undefined
      ? ctx.get('sessionProjections')?.snapshot(session)
      : ctx.get('sessionProjectionCache')?.cachedSnapshot(meta)
    if (block === undefined || Object.keys(block.values).length === 0) return undefined
    return { kind: session !== undefined ? 'sequenced' : 'cached', asOfSeq: block.asOfSeq, values: block.values }
  } catch (error) {
    ctx.logger.warn(`session.list: projection column for "${meta.id}" failed (serving the row without it): ${String(error)}`)
    return undefined
  }
}

function detachedProjectionsFor(ctx, events) {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) return undefined
  return registry.restore({}, events, 0).snapshot
}

function subagentHistoryProjections(ctx, childSessionId, compute) {
  try {
    return compute()
  } catch (error) {
    ctx.logger.warn(`subagent.history: projections for "${childSessionId}" failed (serving the page without them): ${String(error)}`)
    return undefined
  }
}

function subagentPromptError(request, error, signal) {
  const childSessionId = request.payload.childSessionId
  if (signal.aborted) {
    return err(request, { code: 'cancelled', message: 'subagent prompt was cancelled', details: {} })
  }
  if (error instanceof SubagentError) {
    switch (error.code) {
      case 'NOT_RESUMABLE':
        return err(request, {
          code: 'subagent-not-resumable',
          message: 'subagent cannot be resumed',
          details: { childSessionId },
        })
      case 'UNAUTHORIZED':
        return err(request, {
          code: 'subagent-unauthorized',
          message: 'subagent does not belong to this parent',
          details: { childSessionId },
        })
      case 'DRAINING':
      case 'ACTIVATION_CLOSING':
      case 'CONTINUATION_UNAVAILABLE':
      case 'PERSISTENCE_UNAVAILABLE':
        return err(request, {
          code: 'subagent-delivery-unavailable',
          message: 'subagent follow-up is temporarily unavailable',
          details: { childSessionId },
        })
      default:
        break
    }
  }
  return err(request, { code: 'internal', message: 'subagent prompt failed', details: {} })
}

function projectionsUnavailableError() {
  return {
    code: 'internal',
    message: 'subagent catalog is unavailable: this deployment does not mount the sessionProjections registry (load @freddie/freddie-session-projection)',
    details: {},
  }
}

async function catalogChild(ctx, address, signal) {
  const { parentSessionId, childSessionId, mode } = address
  try {
    const entries = await ctx.subagents.listChildren(parentSessionId, signal)
    const entry = entries.find(candidate => candidate.id === childSessionId)
    if (entry === undefined || (entry.kind === 'child' && entry.mode !== mode)) {
      return {
        error: {
          code: 'subagent-not-found',
          message: `session "${childSessionId}" is not a ${mode} direct child of "${parentSessionId}"`,
          details: { parentSessionId, childSessionId },
        },
      }
    }
    if (entry.kind === 'diagnostic') {
      return {
        error: {
          code: 'subagent-catalog-diagnostic',
          message: `subagent "${childSessionId}" is ${entry.reason}`,
          details: { parentSessionId, childSessionId, reason: entry.reason },
        },
      }
    }
    return { entry }
  } catch (error) {
    if (signal?.aborted || (error instanceof SubagentError && error.code === 'CANCELLED')) {
      return { error: { code: 'cancelled', message: 'subagent catalog read was cancelled', details: {} } }
    }
    if (error instanceof SubagentError && error.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
      return { error: projectionsUnavailableError() }
    }
    return { error: { code: 'internal', message: 'subagent catalog read failed', details: {} } }
  }
}

function noRoster(agentPreset) {
  return {
    code: 'agent-preset-not-found',
    message: 'this deployment composes no agent presets',
    details: { agentPreset, available: [] },
  }
}

function presetError(agentPreset, error) {
  if (error instanceof UnknownPresetError) {
    return {
      code: 'agent-preset-not-found',
      message: error.message,
      details: { agentPreset: error.presetId, available: [...error.available] },
    }
  }
  if (error instanceof PresetNotWritableError) {
    return { code: 'agent-preset-read-only', message: error.message, details: { agentPreset, reason: error.message } }
  }
  if (error instanceof InvalidPresetIdError || error instanceof PresetExistsError) {
    return { code: 'agent-preset-invalid', message: error.message, details: { agentPreset, reason: error.message } }
  }
  return { code: 'internal', message: `agent preset "${agentPreset}": ${String(error)}`, details: {} }
}

class AgentPresetConflict extends Error {
  constructor(sessionId, requestedPreset, existingPreset) {
    super(
      existingPreset === undefined
        ? `session "${sessionId}" records no agent preset, so it cannot be adopted under one; `
        + 'a deployment composing no roster records none on any session — '
        : `session "${sessionId}" already runs agent preset ${JSON.stringify(existingPreset)}; `
      + `requested ${JSON.stringify(requestedPreset)}. A session's preset is fixed at creation.`,
    )
    this.sessionId = sessionId
    this.requestedPreset = requestedPreset
    this.existingPreset = existingPreset
  }
}

class SessionCwdConflict extends Error {
  constructor(sessionId, requestedCwd, existingCwd) {
    super(
      `session "${sessionId}" already exists with cwd ${JSON.stringify(existingCwd)}; `
      + `requested ${JSON.stringify(requestedCwd)}`,
    )
    this.sessionId = sessionId
    this.requestedCwd = requestedCwd
    this.existingCwd = existingCwd
  }
}

class WorkspaceNameConflictError extends Error {
  constructor(workspaceName) {
    super(`workspace name '${workspaceName}' is already in use`)
    this.workspaceName = workspaceName
    this.name = 'WorkspaceNameConflictError'
  }
}

function workspaceNotFound(request, workspaceId) {
  return err(request, {
    code: 'workspace-not-found',
    message: `workspace "${workspaceId}" not found`,
    details: { workspaceId },
  })
}

function workspaceView(workspace) {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title,
    sessionIds: [...workspace.sessionIds],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

function changedWorkspaceView(workspaceId, value) {
  const record = workspaceRecord.parse(value)
  return {
    workspaceId,
    path: record.path,
    title: record.title,
    sessionIds: [...record.sessionIds],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function createApiProxy(ctx, defaults) {
  const sessionExportCompressionLevel = defaults.sessionExportCompressionLevel
    ?? DEFAULT_SESSION_LOG_COMPRESSION_LEVEL
  const coldBlankProbeMaxBytes = defaults.coldBlankProbeMaxBytes
    ?? DEFAULT_COLD_BLANK_PROBE_MAX_BYTES
  const maxMuxBufferedFrames = defaults.maxMuxBufferedFrames
    ?? DEFAULT_MAX_MUX_BUFFERED_FRAMES
  const maxMuxBufferedBytes = defaults.maxMuxBufferedBytes
    ?? DEFAULT_MAX_MUX_BUFFERED_BYTES
  const agentOptions = () => {
    const { provider, model } = defaults.defaultModelSelection()
    return { provider, model }
  }
  const selections = new WeakMap()
  const presetSwitches = new Map()
  const sessionCreations = new Map()
  let workspaceCreationChain = Promise.resolve()
  const pendingQuestions = new Map()
  const pendingApprovals = new Map()
  const muxQueues = new Set()
  const imageAdmissionChains = new WeakMap()
  const terminalSubscriptions = new WeakMap()

  function serializeImageAdmission(agent, operation) {
    const result = (imageAdmissionChains.get(agent) ?? Promise.resolve()).then(operation)
    imageAdmissionChains.set(agent, result.then(() => undefined, () => undefined))
    return result
  }

  function selectionFor(agent) {
    const installed = selections.get(agent)
    if (installed !== undefined) return installed
    let picked
    const selection = {
      get current() {
        if (picked !== undefined) return picked
        const logged = agent.session.requestHeader()?.config
        if (logged === undefined) return defaults.defaultModelSelection()
        return {
          provider: logged.provider,
          model: logged.model,
          ...logged.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: logged.reasoningEffort },
        }
      },
      set current(next) {
        picked = next
      },
      assembled: undefined,
    }
    installModelSelection(agent.ctx, selection)
    selections.set(agent, selection)
    return selection
  }

  function installSelection(agentCtx) {
    const agent = agentCtx.agent
    if (agent === undefined) throw new Error('api-proxy: agent setup has no scoped agent')
    selectionFor(agent)
  }

  function assertPresetUnchanged(sessionId, requested, existing) {
    if (requested === undefined || requested === existing) return
    throw new AgentPresetConflict(sessionId, requested, existing)
  }

  async function composeAgent(presetId) {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) {
      return {
        setup: (agentCtx) => {
          installSelection(agentCtx)
          return Promise.resolve()
        },
      }
    }
    const resolvedId = (await presets.resolve(presetId)).id
    return {
      agentPreset: resolvedId,
      setup: async (agentCtx) => {
        installSelection(agentCtx)
        await presets.mount(agentCtx, resolvedId)
      },
    }
  }

  const hasSubagentOwner = (session, agent) => hasApiRemoteSubagentOwner(ctx, session, agent)
  const subagentOwnershipError = (sessionId) => apiRemoteSubagentOwnershipError(sessionId)
  const inspectServable = (sessionId) => inspectApiRemoteSession(ctx, sessionId)
  const agentFor = createApiRemoteAgentResolver(ctx, {
    agentOptions,
    setup: async ({ meta, events }) =>
      (await composeAgent(resolveSessionPreset({ header: meta, events }))).setup,
  })

  function broadcast(payload) {
    const envelope = frame(payload)
    for (const queue of muxQueues) queue.push(envelope)
  }

  function terminalError(request, error) {
    if (!(error instanceof TerminalError)) {
      return err(request, { code: 'terminal-unavailable', message: error instanceof Error ? error.message : String(error), details: {} })
    }
    const code = error.code === 'NO_SESSION' ? 'terminal-not-found'
      : error.code === 'FOREIGN_SESSION' ? 'terminal-unauthorized'
        : 'terminal-unavailable'
    return err(request, { code, message: error.message, details: {} })
  }

  async function terminalOwner(request) {
    const sessionId = request.payload?.sessionId
    const refused = requireNonEmptyString(request, sessionId, 'terminal request requires payload.sessionId as a non-empty string')
    if (refused !== undefined) return { response: refused }
    const found = await agentFor(sessionId)
    return 'error' in found ? { response: err(request, found.error) } : { agent: found.agent }
  }

  function subscribeTerminal(agent) {
    if (terminalSubscriptions.has(agent)) return
    terminalSubscriptions.set(agent, ctx.terminals.subscribe(agent, activity => {
      broadcast({ type: 'terminal/activity', sessionId: agent.id, activity })
    }))
  }

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.onChanged((session, key, value, seq) => {
      broadcast({ type: 'session/projection', sessionId: session.id, key, value, seq })
    })
  })

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: 'sessionListMetadata',
      init: () => ({ blank: true, lastPromptAt: null, errored: false }),
      apply: applySessionListMetadata,
      wire: { view: state => state },
      stateVersion: 2,
    })
  })

  ctx.inject(['sessionProjections', 'attachments'], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: 'imageLimits',
      init: () => null,
      apply: state => state,
      wire: { view: () => projectionCtx.attachments.imageLimits },
      stateVersion: 1,
    })
  })

  const queueItems = (agent, splice) => {
    const project = (target) => {
      const messages = target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep
      return splice?.target === target
        ? messages.toSpliced(splice.start, splice.removedCount ?? 0, ...splice.inserted)
        : messages
    }
    return [
      ...project('next-turn').map(message => ({ id: message.id, placement: 'queued', message })),
      ...project('next-step').map(message => ({
        id: message.id,
        placement: message.source.kind === 'user' ? 'steering' : 'context',
        message,
      })),
    ]
  }

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'agent/inbox/spliced') return
    const agent = ctx.agents.get(session.id)
    if (agent?.session !== session) return
    broadcast({ type: 'session/queue', sessionId: session.id, items: queueItems(agent, event.data) })
  })

  function claimQuestion(pending, outcome) {
    pendingQuestions.delete(pending.rpcId)
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    broadcast({
      type: 'question/resolved', sessionId: pending.sessionId,
      questionRpcId: pending.rpcId, outcome,
    })
  }

  const disposeProvider = ctx.userQuestions.registerProvider({
    ask(request) {
      if (request.signal?.aborted === true) {
        return Promise.reject(new UserQuestionError(
          'ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
      }
      const sessionId = request.agent?.id
      if (sessionId === undefined) {
        return Promise.reject(new UserQuestionError(
          'web user interaction requires an agent-owned session', 'ASK_MISSING_AGENT'))
      }
      return new Promise((resolve, reject) => {
        const rpcId = RpcId(randomUUID())
        const pending = {
          rpcId, sessionId, questions: request.questions, resolve, reject,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        }
        const onAbort = () => {
          claimQuestion(pending, 'cancelled')
          reject(new UserQuestionError(
            'ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
        }
        pending.onAbort = onAbort
        pendingQuestions.set(rpcId, pending)
        request.signal?.addEventListener('abort', onAbort, { once: true })
        const envelope = {
          rpcId,
          payload: { type: 'question/requested', sessionId, questions: request.questions },
        }
        for (const queue of muxQueues) queue.push(envelope)
      })
    },
  })
  ctx.effect(() => () => {
    disposeProvider()
    for (const pending of [...pendingQuestions.values()]) {
      claimQuestion(pending, 'cancelled')
      pending.reject(new UserQuestionError(
        'web user-questions provider was disposed', 'ASK_ABORTED'))
    }
  }, 'api-proxy: user-questions provider')

  if (ctx.get('approval') !== undefined) {
    ctx.effect(() => () => {
      for (const pending of [...pendingApprovals.values()]) pending.resolve('cancelled')
    }, 'api-proxy: approval registry teardown')
    ctx.on('approval/request', (req, next) => {
      if (req.signal?.aborted === true) return Promise.resolve('cancelled')
      const events = req.agent.session.events
      const claimed = new Set()
      for (const entry of pendingApprovals.values()) claimed.add(entry.approvalId)
      const decided = new Set()
      let approvalId
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]
        if (event.type === 'approval/decided') {
          decided.add(event.data.id)
        } else if (event.type === 'approval/asked') {
          if (decided.has(event.data.id) || claimed.has(event.data.id)) continue
          if ((req.callId ?? null) !== (event.data.callId ?? null)) continue
          approvalId = event.data.id
          break
        }
      }
      if (approvalId === undefined) return next()
      const id = approvalId
      return new Promise((resolve) => {
        const settle = (outcome) => {
          if (!pendingApprovals.delete(pending.rpcId)) return
          req.signal?.removeEventListener('abort', onAbort)
          broadcast({ type: 'approval/resolved', sessionId: pending.sessionId, approvalId: id, outcome })
          resolve(outcome)
        }
        const onAbort = () => { settle('cancelled') }
        const pending = {
          rpcId: RpcId(randomUUID()),
          sessionId: req.agent.session.id,
          approvalId: id,
          toolName: req.toolName,
          ...req.callId === undefined ? {} : { callId: req.callId },
          ...req.reason === undefined ? {} : { reason: req.reason },
          resolve: settle,
        }
        pendingApprovals.set(pending.rpcId, pending)
        req.signal?.addEventListener('abort', onAbort, { once: true })
        const envelope = requestedFrame(pending)
        for (const queue of muxQueues) queue.push(envelope)
      })
    })
  }

  async function readSessionState(sessionId) {
    const attached = ctx.sessions.get(sessionId)
    if (attached !== undefined) {
      return {
        id: attached.id,
        header: attached.header,
        events: [...attached.events],
      }
    }
    const inspected = await inspectServable(sessionId)
    return { id: inspected.meta.id, header: inspected.meta, events: inspected.events }
  }

  async function forkWorkspace(source) {
    const workspaces = ctx.workspaceRegistry.list()
    const direct = workspaces.find(workspace => workspace.sessionIds.includes(source.id))
    if (direct !== undefined || source.header.origin !== 'subagent') return direct

    const lineage = await ctx.sessionQuery.traceSession(source.id)
    for (const ancestor of lineage.ancestors) {
      const workspace = workspaces.find(candidate => candidate.sessionIds.includes(ancestor.header.id))
      if (workspace !== undefined) return workspace
    }
    return undefined
  }

  async function historySourceFor(sessionId) {
    const attached = ctx.sessions.get(sessionId)
    if (attached !== undefined) return { kind: 'attached', session: attached }
    const inspected = await inspectServable(sessionId)
    return { kind: 'detached', header: inspected.meta, events: inspected.events }
  }

  function sourceSession(source) {
    if (source.kind === 'detached') return { header: source.header, events: source.events }
    return { header: source.session.header, events: source.session.events }
  }

  function historyCutOf(source, includeProjections) {
    if (source.kind === 'detached') {
      const projections = includeProjections ? detachedProjectionsFor(ctx, source.events) : undefined
      return { events: source.events, ...projections === undefined ? {} : { projections } }
    }
    const events = [...source.session.events]
    const projections = includeProjections ? projectionsFor(ctx, source.session) : undefined
    return { events, ...projections === undefined ? {} : { projections } }
  }

  async function presenterScopeFor(sessionId, session) {
    const live = ctx.get('agents')?.get(sessionId)
    if (live !== undefined) return live
    const presets = ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      return await presets.standingKeyFor(resolveSessionPreset(session))
    } catch {
      return undefined
    }
  }

  async function ensureSession(sessionId, cwd, checkPersistedIdentity, presetId) {
    let creation = sessionCreations.get(sessionId)
    if (creation === undefined) {
      creation = (async () => {
        const attached = ctx.sessions.get(sessionId)
        const live = ctx.agents.get(sessionId)
        if (attached !== undefined && hasSubagentOwner(attached, live)) {
          throw new SubagentSessionOwnership(sessionId)
        }
        if (live !== undefined) return live

        const persistence = checkPersistedIdentity ? ctx.get('sessionPersistence') : undefined
        const stored = persistence === undefined
          ? undefined
          : (await persistence.list()).find(header => header.id === sessionId)
        if (persistence !== undefined && stored !== undefined) {
          const inspected = await persistence.inspect(sessionId)
          if (hasSubagentOwner({ header: inspected.meta }, undefined)) {
            throw new SubagentSessionOwnership(sessionId)
          }
          if (inspected.meta.cwd !== cwd) {
            throw new SessionCwdConflict(sessionId, cwd, inspected.meta.cwd)
          }
          const storedPreset = resolveSessionPreset({ header: inspected.meta, events: inspected.events })
          assertPresetUnchanged(sessionId, presetId, storedPreset)
          return (await ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions: agentOptions(),
            setup: (await composeAgent(storedPreset)).setup,
          })).agent
        }

        try {
          await mkdir(cwd, { recursive: true })
        } catch (error) {
          throw new Error(`failed to ensure project directory "${cwd}": ${String(error)}`, { cause: error })
        }
        const composition = await composeAgent(presetId)
        return (await ctx.agents.create({
          sessionId,
          agentOptions: agentOptions(),
          meta: {
            cwd,
            ...composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset },
          },
          setup: composition.setup,
        })).agent
      })().catch((error) => {
        const live = ctx.agents.get(sessionId)
        if (live !== undefined) {
          if (hasSubagentOwner(live.session, live)) throw new SubagentSessionOwnership(sessionId)
          return live
        }
        const attached = ctx.sessions.get(sessionId)
        if (attached !== undefined && hasSubagentOwner(attached, undefined)) {
          throw new SubagentSessionOwnership(sessionId)
        }
        throw error
      }).finally(() => {
        sessionCreations.delete(sessionId)
      })
      sessionCreations.set(sessionId, creation)
    }
    const agent = await creation
    if (hasSubagentOwner(agent.session, agent)) throw new SubagentSessionOwnership(sessionId)
    assertPresetUnchanged(sessionId, presetId, resolveSessionPreset(agent.session))
    if (agent.session.header.cwd !== cwd) {
      throw new SessionCwdConflict(sessionId, cwd, agent.session.header.cwd)
    }
    return agent
  }

  function ensureWorkspace(path) {
    const operation = workspaceCreationChain.then(async () => {
      const existing = await ctx.workspaceRegistry.resolveByPath(path)
      if (existing !== undefined) return { workspace: existing, created: false }
      return { workspace: await ctx.workspaceRegistry.create(path), created: true }
    })
    workspaceCreationChain = operation.then(() => undefined, () => undefined)
    return operation
  }

  async function listVisibleSessionSummaries(signal) {
    signal?.throwIfAborted()
    const summarizeAttached = (session) => {
      const agent = ctx.agents.get(session.id)
      const projections = listProjectionsFor(ctx, session.header, session)
      return {
        ...summarize(session, agent?.status === 'running'),
        agentAvailable: agent?.session === session,
        ...projections === undefined ? {} : { projections },
      }
    }
    const items = ctx.sessions.list().map(summarizeAttached)
    signal?.throwIfAborted()
    const attached = new Set(items.map(item => item.sessionId))
    const persistence = ctx.get('sessionPersistence')
    if (persistence !== undefined) {
      const cold = (await persistence.list(signal))
        .filter(meta => !attached.has(meta.id) && meta.cwd !== undefined)
      signal?.throwIfAborted()
      for (let offset = 0; offset < cold.length; offset += COLD_SUMMARY_BATCH_SIZE) {
        signal?.throwIfAborted()
        const batch = cold.slice(offset, offset + COLD_SUMMARY_BATCH_SIZE)
        const settled = await Promise.allSettled(
          batch.map(async (meta) => {
            const projections = listProjectionsFor(ctx, meta, undefined)
            const summary = await summarizeCold(
              ctx,
              persistence,
              meta,
              projections?.values.sessionListMetadata,
              coldBlankProbeMaxBytes,
              signal,
            )
            const attachedSession = ctx.sessions.get(meta.id)
            if (attachedSession !== undefined) return summarizeAttached(attachedSession)
            return {
              ...summary,
              ...projections === undefined ? {} : { projections },
            }
          }),
        )
        const summaries = []
        let rejected = false
        let failure
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            summaries.push(result.value)
          } else if (!rejected) {
            rejected = true
            failure = result.reason
          }
        }
        if (rejected) throw failure
        signal?.throwIfAborted()
        items.push(...summaries)
      }
      const extraRoots = persistence.extraRoots ?? []
      if (typeof persistence.listForeign === 'function') {
        const seen = new Set(items.map(item => item.sessionId))
        for (const extra of extraRoots) {
          signal?.throwIfAborted()
          let foreign
          try {
            foreign = await persistence.listForeign(extra, signal)
          } catch (error) {
            ctx.logger?.warn?.(
              `skipping extra session root ${JSON.stringify(extra)}: ${String(error.message ?? error)}`,
            )
            continue
          }
          for (const meta of foreign) {
            if (meta.cwd === undefined || seen.has(meta.id)) continue
            seen.add(meta.id)
            items.push({
              sessionId: meta.id,
              updatedAt: sessionListUpdatedAt(meta, undefined),
              running: false,
              blank: false,
              errored: false,
              agentAvailable: false,
              readOnly: true,
              extraHome: extra,
              ...sessionListFields(meta),
            })
          }
        }
      }
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt)
    return items
  }

  function goalServiceFor(agent) {
    const presets = ctx.get('agentPresets')
    const goals = presets?.serviceFor(agent, 'goals') ?? ctx.get('goals')
    if (goals === undefined) {
      return { error: { code: 'internal', message: 'goal service is absent: neither this session\'s agent preset nor the host composition mounts @freddie/freddie-goal', details: {} } }
    }
    return goals
  }

  function goalError(request, error) {
    const details = error instanceof GoalError ? { goalCode: error.code } : {}
    return err(request, { code: 'internal', message: String(error), details })
  }

  async function mutateGoal(request, mutation) {
    const sessionId = request.payload?.sessionId
    const refused = requireNonEmptyString(request, sessionId, 'goal mutation requires payload.sessionId as a non-empty string')
    if (refused !== undefined) return refused
    const found = await agentFor(sessionId)
    if ('error' in found) return err(request, found.error)
    const goals = goalServiceFor(found.agent)
    if ('error' in goals) return err(request, goals.error)
    try {
      const ref = mutation(goals, found.agent)
      return ok(request, { ref: { id: ref.id, revision: ref.revision } })
    } catch (error) {
      return goalError(request, error)
    }
  }

  function routeServed(provider) {
    const llm = ctx.get('llm')
    return llm === undefined || llm.listProviders().some(entry => entry.id === provider)
  }

  async function turnAgentFor(request, sessionId) {
    const found = await agentFor(sessionId)
    if ('error' in found) return { refused: err(request, found.error) }
    const agent = found.agent
    const selection = selectionFor(agent).current
    if (!routeServed(selection.provider)) {
      return {
        refused: err(request, {
          code: 'model-unavailable',
          message: `no adapter serves provider "${selection.provider}"; select a model for this session`,
          details: { provider: selection.provider, model: selection.model },
        }),
      }
    }
    return { agent }
  }

  function settingsAbsent() {
    return { code: 'internal', message: 'settings service is absent: this deployment does not mount a settings provider (e.g. @freddie/freddie-settings-file) in its composition', details: {} }
  }

  async function openTarget(request, path, signal, open) {
    try {
      await open(path, signal)
      return ok(request, { opened: true })
    } catch (error) {
      if (signal.aborted) {
        return err(request, {
          code: 'cancelled',
          message: 'path open was aborted',
          details: {},
        })
      }
      return err(request, {
        code: 'internal',
        message: `path open failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {},
      })
    }
  }

  function openPath(request, path, signal) {
    const open = defaults.openPath
      ?? ((target, openSignal) => openNativePath(target, openSignal))
    return openTarget(request, path, signal, open)
  }

  function openTextFile(request, path, signal) {
    const open = defaults.openTextFile
      ?? ((target, openSignal) => openNativeTextFile(target, openSignal))
    return openTarget(request, path, signal, open)
  }

  function canOpenPaths() {
    if (defaults.canOpenPath !== undefined) return defaults.canOpenPath()
    return defaults.openPath !== undefined || canOpenNativePath()
  }

  function credentialsAbsent() {
    return { code: 'internal', message: 'credentials service is absent: this deployment does not mount a credential provider (e.g. @freddie/freddie-credentials-local) in its composition', details: {} }
  }

  function namespaceView(descriptor) {
    return {
      ns: String(descriptor.ns),
      schema: descriptor.schema,
      value: descriptor.value,
      ...descriptor.base === undefined ? {} : { base: descriptor.base },
      ...descriptor.user === undefined ? {} : { user: descriptor.user },
      applies: descriptor.applies,
      secrets: (descriptor.secrets ?? []).map(secret => ({ path: [...secret.path], set: secret.set })),
      revision: descriptor.revision,
    }
  }

  async function settingsWrite(request, ns, mode, section, expectedRevision) {
    const settings = ctx.get('settings')
    if (settings === undefined) return err(request, settingsAbsent())
    const rejected = (error) => {
      if (error instanceof SettingsConflictError) {
        return err(request, {
          code: 'settings-conflict',
          message: error.message,
          details: { ns, expected: error.expected, actual: error.actual },
        })
      }
      return err(request, {
        code: 'settings-rejected',
        message: error instanceof Error ? error.message : String(error),
        details: { ns },
      })
    }
    let branded
    try {
      branded = settingsNamespace(ns)
    } catch (error) {
      return rejected(error)
    }
    try {
      if (mode === 'update') await settings.update(branded, section, expectedRevision)
      else if (mode === 'replace') await settings.replace(branded, section, expectedRevision)
      else await settings.mutate(branded, section, expectedRevision)
    } catch (error) {
      return rejected(error)
    }
    const descriptor = settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === branded)
    if (descriptor === undefined) {
      return err(request, { code: 'internal', message: `settings namespace "${ns}" was disposed after the ${mode}`, details: {} })
    }
    return ok(request, namespaceView(descriptor))
  }

  return {
    sessions: {
      async list(request) {
        return ok(request, { items: await listVisibleSessionSummaries() })
      },

      async search(request, signal) {
        const cancelled = () => err(request, {
          code: 'cancelled',
          message: 'session search was aborted',
          details: {},
        })
        const query = request.payload?.query
        const refused = requireNonEmptyString(request, query, 'session.search requires payload.query as a non-empty string')
        if (refused !== undefined) return refused
        if (isAborted(signal)) return cancelled()
        const sessionQuery = ctx.get('sessionQuery')
        if (sessionQuery === undefined) {
          return err(request, {
            code: 'internal',
            message: 'session search is unavailable: this deployment does not mount @freddie/freddie-session-query',
            details: {},
          })
        }
        try {
          const visible = await listVisibleSessionSummaries(signal)
          if (isAborted(signal)) return cancelled()
          if (visible.length === 0) return ok(request, { items: [], hasMore: false })
          const visibleIds = new Set(visible.map(item => item.sessionId))
          const authorized = []
          const acceptedIds = new Set()
          const seenCursors = new Set()
          let cursor
          let providerCallCount = 0
          let providerPageLimit = SESSION_SEARCH_RESULT_LIMIT
          while (authorized.length <= SESSION_SEARCH_RESULT_LIMIT) {
            if (isAborted(signal)) return cancelled()
            if (providerCallCount >= SESSION_SEARCH_PROVIDER_CALL_LIMIT) {
              throw new Error(
                `session search provider exceeded the ${SESSION_SEARCH_PROVIDER_CALL_LIMIT}-call work budget`,
              )
            }
            providerCallCount++
            const requestedCursor = cursor
            const requestedPageLimit = providerPageLimit
            let page
            try {
              page = await sessionQuery.searchSessions({
                query: request.payload.query,
                eventFilters: [
                  { kind: 'type', values: ['user/message', 'assistant/message'] },
                  { kind: 'surface', values: ['current'] },
                ],
                limit: requestedPageLimit,
                ...requestedCursor === undefined ? {} : { cursor: requestedCursor },
              }, { signal })
            } catch (error) {
              if (isAborted(signal)) return cancelled()
              if (
                requestedCursor === undefined
                && error instanceof SessionQueryError
                && error.code === 'SESSION_QUERY_INVALID_LIMIT'
                && requestedPageLimit > 1
              ) {
                providerPageLimit = Math.max(1, Math.floor(requestedPageLimit / 2))
                continue
              }
              if (
                requestedCursor !== undefined
                && error instanceof SessionQueryError
                && error.code === 'SESSION_QUERY_STALE_CURSOR'
              ) {
                authorized.length = 0
                acceptedIds.clear()
                seenCursors.clear()
                cursor = undefined
                continue
              }
              throw error
            }
            if (isAborted(signal)) return cancelled()
            const providerItemCount = page.items.length
            if (providerItemCount > requestedPageLimit) {
              throw new Error(
                `session search provider returned ${providerItemCount} items; maximum is ${requestedPageLimit}`,
              )
            }
            for (const hit of page.items) {
              if (authorized.length > SESSION_SEARCH_RESULT_LIMIT) continue
              if (
                !visibleIds.has(hit.header.id)
                || hit.bestMatch.sessionId !== hit.header.id
                || hit.bestMatch.surface !== 'current'
                || !MESSAGE_TYPES.has(hit.bestMatch.type)
                || acceptedIds.has(hit.header.id)
              ) continue
              const snippet = truncateUnicodeCodePoints(
                hit.bestMatch.snippet,
                SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
              )
              acceptedIds.add(hit.header.id)
              authorized.push({
                sessionId: hit.header.id,
                snippet,
              })
            }
            const nextCursor = page.nextCursor
            if (nextCursor !== undefined) {
              if (seenCursors.has(nextCursor)) {
                throw new Error('session search provider repeated a continuation cursor')
              }
              seenCursors.add(nextCursor)
            }
            if (authorized.length > SESSION_SEARCH_RESULT_LIMIT || nextCursor === undefined) break
            cursor = nextCursor
          }
          return ok(request, {
            items: authorized.slice(0, SESSION_SEARCH_RESULT_LIMIT),
            hasMore: authorized.length > SESSION_SEARCH_RESULT_LIMIT,
          })
        } catch (error) {
          if (
            isAborted(signal)
            || (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_ABORTED')
          ) return cancelled()
          if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SEARCH_DISABLED') {
            return err(request, {
              code: 'search-unavailable',
              message: 'session search is disabled in this deployment',
              details: {},
            })
          }
          return err(request, {
            code: 'internal',
            message: `session search failed: ${String(error)}`,
            details: {},
          })
        }
      },

      async create(request) {
        const payload = request.payload ?? {}
        if (payload.sessionId !== undefined) {
          const refused = requireNonEmptyString(request, payload.sessionId, 'session.create payload.sessionId must be a non-empty string when present')
          if (refused !== undefined) return refused
        }
        if (payload.workspaceId !== undefined) {
          const refused = requireNonEmptyString(request, payload.workspaceId, 'session.create payload.workspaceId must be a non-empty string when present')
          if (refused !== undefined) return refused
        }
        if (payload.cwd !== undefined) {
          const refused = requireNonEmptyString(request, payload.cwd, 'session.create payload.cwd must be a non-empty string when present')
          if (refused !== undefined) return refused
        }
        if (payload.agentPreset !== undefined) {
          const refused = requireNonEmptyString(request, payload.agentPreset, 'session.create payload.agentPreset must be a non-empty string when present')
          if (refused !== undefined) return refused
        }
        const sessionId = payload.sessionId ?? `session-${randomUUID()}`
        let workspace
        if (payload.workspaceId !== undefined) {
          workspace = ctx.workspaceRegistry.get(brandWorkspaceId(payload.workspaceId))
          if (workspace === undefined) {
            return err(request, {
              code: 'workspace-not-found',
              message: `workspace "${payload.workspaceId}" not found`,
              details: { workspaceId: payload.workspaceId },
            })
          }
        }
        const cwd = workspace?.path ?? payload.cwd ?? defaults.cwd
        const requestedPreset = payload.agentPreset
        try {
          await ensureSession(sessionId, cwd, payload.sessionId !== undefined, requestedPreset)
        } catch (error) {
          if (error instanceof AgentPresetConflict) {
            return err(request, {
              code: 'agent-preset-conflict',
              message: error.message,
              details: {
                sessionId: error.sessionId,
                requestedPreset: error.requestedPreset,
                ...error.existingPreset === undefined ? {} : { existingPreset: error.existingPreset },
              },
            })
          }
          const refused = presetFailure(request, error)
          if (refused !== undefined) return refused
          if (error instanceof SessionCwdConflict) {
            return err(request, {
              code: 'session-conflict',
              message: error.message,
              details: {
                sessionId: error.sessionId,
                requestedCwd: error.requestedCwd,
                ...error.existingCwd === undefined ? {} : { existingCwd: error.existingCwd },
              },
            })
          }
          if (error instanceof SubagentSessionOwnership) {
            return err(request, subagentOwnershipError(error.sessionId))
          }
          return err(request, {
            code: 'internal',
            message: `failed to create session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        if (workspace !== undefined) {
          try {
            await workspace.attachSession(sessionId)
          } catch (error) {
            return err(request, {
              code: 'workspace-attach-failed',
              message: `session "${sessionId}" was created but could not attach to workspace "${workspace.id}": ${String(error)}`,
              details: { sessionId, workspaceId: workspace.id },
            })
          }
        }
        const created = ctx.agents.get(sessionId)
        const createdPreset = created === undefined ? undefined : resolveSessionPreset(created.session)
        return ok(request, { sessionId, ...createdPreset === undefined ? {} : { agentPreset: createdPreset } })
      },

      async history(request) {
        const { sessionId, beforeSeq, maxMessages } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.history requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        try {
          const source = await historySourceFor(sessionId)
          const scope = await presenterScopeFor(sessionId, sourceSession(source))
          const cut = historyCutOf(source, beforeSeq === undefined)
          const page = historyPage(ctx, cut.events, beforeSeq, maxMessages, scope)
          return ok(request, {
            events: page.events,
            hasMore: page.hasMore,
            ...cut.projections === undefined ? {} : { projections: cut.projections },
          })
        } catch (error) {
          if (error instanceof SessionNotFound) {
            return err(request, { code: 'session-not-found', message: error.message, details: { sessionId } })
          }
          return err(request, {
            code: 'internal',
            message: `history unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
      },

      async models(request) {
        const { sessionId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.models requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const current = selectionFor(found.agent).current
        const { groups, failures } = await buildModelCatalog(ctx)
        const routable = routeServed(current.provider)
        return ok(request, { current: { ...current }, routable, groups, failures })
      },

      async selectModel(request) {
        const { sessionId, provider, model, reasoningEffort } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.selectModel requires payload.sessionId as a non-empty string')
          ?? requireNonEmptyString(request, provider, 'session.selectModel requires payload.provider as a non-empty string')
          ?? requireNonEmptyString(request, model, 'session.selectModel requires payload.model as a non-empty string')
        if (refused !== undefined) return refused
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        return serializeImageAdmission(found.agent, async () => {
          try {
            const resolved = await ctx.llm.resolveCallConfig({
              provider,
              model,
              ...reasoningEffort === undefined
                ? {}
                : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
            })
            const selected = {
              provider: resolved.provider,
              model: resolved.model,
              ...resolved.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: resolved.reasoningEffort },
            }
            selectionFor(found.agent).current = selected
            try {
              await defaults.saveDefaultModelSelection?.(selected)
            } catch (error) {
              ctx.logger.warn(
                `api-proxy: the model switch applies to this session but was not saved as the default: ${String(error)}`,
              )
            }
            return ok(request, { selected: { ...selected } })
          } catch (error) {
            return err(request, {
              code: 'model-unavailable',
              message: error instanceof Error ? error.message : String(error),
              details: { provider, model },
            })
          }
        })
      },

      async rename(request) {
        const { sessionId, title } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.rename requires payload.sessionId as a non-empty string')
          ?? requireNonEmptyString(request, title, 'session.rename requires payload.title as a non-empty string')
        if (refused !== undefined) return refused
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const titles = ctx.get('sessionTitle')
        if (titles === undefined) {
          return err(request, { code: 'internal', message: 'renaming is unavailable: this deployment mounts no session-title service', details: {} })
        }
        try {
          const accepted = titles.rename(found.agent.session, title)
          return ok(request, { title: accepted.title, seq: accepted.eventSeq })
        } catch (error) {
          if (error instanceof SessionTitleInvalidError) {
            return err(request, {
              code: 'title-invalid',
              message: error.message,
              details: { sessionId },
            })
          }
          return err(request, {
            code: 'internal',
            message: `failed to rename session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
      },

      async fork(request) {
        const { sessionId, atSeq } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.fork requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        let source
        try {
          source = await readSessionState(sessionId)
        } catch (error) {
          if (error instanceof SessionNotFound) {
            return err(request, { code: 'session-not-found', message: error.message, details: { sessionId } })
          }
          return err(request, {
            code: 'internal',
            message: `fork source unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const events = source.events
        const lastSeq = events.at(-1)?.seq ?? -1
        const anchoredBoundary = atSeq === undefined
          ? undefined
          : events.find(e => e.type === 'turn/end' && e.seq >= atSeq)
        const boundary = anchoredBoundary
          ?? (atSeq === undefined || atSeq > lastSeq
            ? events.findLast(e => e.type === 'turn/end')
            : undefined)
        if (boundary === undefined) {
          return err(request, {
            code: 'fork-unavailable',
            message: atSeq !== undefined && atSeq <= lastSeq
              ? `session "${sessionId}" has not completed the turn containing event ${String(atSeq)}`
              : `session "${sessionId}" has no completed turn to fork from`,
            details: { sessionId },
          })
        }
        let cut = boundary.seq + 1
        while (cut < events.length && events[cut]?.type !== 'turn/start') cut++
        let workspace
        try {
          workspace = await forkWorkspace(source)
        } catch (error) {
          return err(request, {
            code: 'internal',
            message: `failed to resolve fork workspace for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const childId = `session-${randomUUID()}`
        const forkComposition = await composeAgent(resolveSessionPreset(source))
        try {
          await ctx.agents.create({
            sessionId: childId,
            seed: events.slice(0, cut),
            meta: {
              ...source.header.cwd === undefined ? {} : { cwd: source.header.cwd },
              parentSession: source.id,
              seedLength: cut,
              ...forkComposition.agentPreset === undefined
                ? {}
                : { agentPreset: forkComposition.agentPreset },
            },
            agentOptions: agentOptions(),
            setup: forkComposition.setup,
          })
        } catch (error) {
          return err(request, {
            code: 'internal',
            message: `failed to fork session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        if (workspace !== undefined) {
          try {
            await workspace.attachSession(childId)
          } catch (error) {
            return err(request, {
              code: 'workspace-attach-failed',
              message: `session "${childId}" was forked but could not attach to workspace "${workspace.id}": ${String(error)}`,
              details: { sessionId: childId, workspaceId: workspace.id },
            })
          }
        }
        return ok(request, { sessionId: childId })
      },

      async prompt(request) {
        const { sessionId, mode, content, clientTimeZone } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.prompt requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        if (!Array.isArray(content)) {
          return badRequest(request, 'session.prompt requires payload.content as an array')
        }
        const canonicalTimeZone = clientTimeZone === undefined
          ? undefined
          : canonicalClientTimeZone(clientTimeZone)
        if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
          return err(request, {
            code: 'invalid-time-zone',
            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
            details: { value: clientTimeZone },
          })
        }
        const resolved = await turnAgentFor(request, sessionId)
        if ('refused' in resolved) return resolved.refused
        const agent = resolved.agent
        const source = {
          kind: 'user',
          rpcId: request.rpcId,
          ...(canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone }),
        }
        const hasImage = content.some(part => part.type === 'image')
        const admit = async () => {
          try {
            if (hasImage) {
              const current = selectionFor(agent).current
              const modelInfo = await ctx.llm.resolveModelInfo(current.provider, current.model)
              if (modelInfo.inputModalities !== undefined && !modelInfo.inputModalities.includes('image')) {
                return err(request, {
                  code: 'attachment-error',
                  message: `Model "${current.model}" does not support image input.`,
                  details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
                })
              }
            }
            const durable = await durablePromptContent(ctx, content)
            const message = createUserMessage({ content: durable, source })
            if (mode === 'steer') agent.steer(message)
            else agent.followup(message)
          } catch (error) {
            if (error instanceof AttachmentError) {
              return err(request, {
                code: 'attachment-error',
                message: error.message,
                details: { reason: error.code },
              })
            }
            return err(request, {
              code: 'agent-busy',
              message: 'prompt rejected',
              details: { reason: String(error) },
            })
          }
          return ok(request, { accepted: true })
        }
        return hasImage ? serializeImageAdmission(agent, admit) : admit()
      },

      async attachment(request) {
        const { sessionId, attachmentId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.attachment requires payload.sessionId as a non-empty string')
          ?? requireNonEmptyString(request, attachmentId, 'session.attachment requires payload.attachmentId as a non-empty string')
        if (refused !== undefined) return refused
        let state
        try {
          state = await readSessionState(sessionId)
        } catch (error) {
          if (error instanceof SessionNotFound) {
            return err(request, {
              code: 'session-not-found',
              message: error.message,
              details: { sessionId },
            })
          }
          return err(request, {
            code: 'internal',
            message: `attachment authorization unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const ref = referencedImage(state.events, String(attachmentId))
        if (ref === undefined) {
          return err(request, {
            code: 'attachment-error',
            message: 'Image is not referenced by this session.',
            details: { reason: 'ATTACHMENT_NOT_REFERENCED' },
          })
        }
        try {
          const stored = await ctx.attachments.readImage(ref)
          return ok(request, {
            attachment: stored.ref,
            data: Buffer.from(stored.data).toString('base64'),
          })
        } catch (error) {
          if (error instanceof AttachmentError) {
            return err(request, {
              code: 'attachment-error',
              message: error.message,
              details: { reason: error.code },
            })
          }
          return err(request, {
            code: 'internal',
            message: 'Unable to read image attachment.',
            details: {},
          })
        }
      },

      updateQueue(request) {
        const { sessionId, itemId, action } = request.payload ?? {}
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          return Promise.resolve(badRequest(request, 'session.updateQueue requires payload.sessionId as a non-empty string'))
        }
        if (typeof itemId !== 'string' || itemId.length === 0) {
          return Promise.resolve(badRequest(request, 'session.updateQueue requires payload.itemId as a non-empty string'))
        }
        if (action === null || typeof action !== 'object' || typeof action.kind !== 'string') {
          return Promise.resolve(badRequest(request, 'session.updateQueue requires payload.action as an object with a string kind'))
        }
        if (action.kind === 'edit' && !Array.isArray(action.content)) {
          return Promise.resolve(badRequest(request, 'session.updateQueue edit action requires action.content as an array'))
        }
        if (action.kind === 'edit' && action.content.some(block => block.type !== 'text')) {
          return Promise.resolve(err(request, {
            code: 'attachment-error',
            message: 'queue edits accept text content only',
            details: { reason: 'QUEUE_EDIT_NON_TEXT' },
          }))
        }
        const agent = ctx.agents.get(sessionId)
        if (agent !== undefined && hasSubagentOwner(agent.session, agent)) {
          return Promise.resolve(err(request, subagentOwnershipError(sessionId)))
        }
        if (agent === undefined) {
          return Promise.resolve(err(request, {
            code: 'queue-item-not-found',
            message: 'queued item is no longer pending',
            details: { itemId },
          }))
        }
        const target = agent.inbox.nextTurn.some(message => message.id === itemId)
          ? 'next-turn'
          : agent.inbox.nextStep.some(message => message.id === itemId) ? 'next-step' : undefined
        const message = target === undefined
          ? undefined
          : (target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep)
            .find(candidate => candidate.id === itemId)
        if (target === undefined || message === undefined) {
          return Promise.resolve(err(request, {
            code: 'queue-item-not-found',
            message: 'queued item is no longer pending',
            details: { itemId },
          }))
        }
        if (action.kind === 'steer' && (target !== 'next-turn' || agent.status !== 'running')) {
          return Promise.resolve(err(request, {
            code: 'steer-unavailable',
            message: 'current turn no longer accepts steering',
            details: { itemId },
          }))
        }
        if (action.kind === 'edit') {
          agent.inbox.replace(itemId, freezeMessage({ ...message, content: action.content }))
        } else {
          agent.inbox.remove(itemId)
          if (action.kind === 'steer') agent.steer(message)
        }
        return Promise.resolve(ok(request, { accepted: true }))
      },

      cancel(request) {
        const { sessionId, confirm } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'session.cancel requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return Promise.resolve(refused)
        const agent = ctx.agents.get(sessionId)
        if (agent === undefined) {
          return Promise.resolve(err(request, {
            code: 'session-not-found',
            message: `session "${sessionId}" not found (not attached)`,
            details: { sessionId },
          }))
        }
        if (hasSubagentOwner(agent.session, agent)) {
          return Promise.resolve(err(request, subagentOwnershipError(sessionId)))
        }
        if (agent.status === 'running' && confirm !== true) {
          return Promise.resolve(err(request, {
            code: 'session-cancel-requires-confirm',
            message: `session "${sessionId}" has a turn running; cancelling it would abort that turn `
              + 'mid-tool-call. Pass payload.confirm=true to proceed if this is intentional (e.g. a user '
              + 'Stop action or a deliberate self-abort), otherwise this call would silently kill the '
              + 'session\'s own current turn.',
            details: { sessionId },
          }))
        }
        agent.cancel({ kind: 'user' }, { keepInbox: true })
        return Promise.resolve(ok(request, { accepted: true }))
      },
    },

    subagents: {
      async list(request, signal) {
        const parentSessionId = request.payload?.parentSessionId
        const refused = requireNonEmptyString(request, parentSessionId, 'subagent.list requires payload.parentSessionId as a non-empty string')
        if (refused !== undefined) return refused
        try {
          const entries = await ctx.subagents.listChildren(parentSessionId, signal)
          return ok(request, {
            entries: entries.map(entry => entry.kind === 'child'
              ? {
                ...entry,
                activity: ctx.agents.get(entry.id)?.status === 'running' ? 'running' : 'inactive',
              }
              : entry),
            parentAvailable: ctx.agents.get(parentSessionId) !== undefined,
          })
        } catch (error) {
          if (signal?.aborted || (error instanceof SubagentError && error.code === 'CANCELLED')) {
            return err(request, {
              code: 'cancelled',
              message: 'subagent catalog read was cancelled',
              details: {},
            })
          }
          if (error instanceof SubagentError && error.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
            return err(request, projectionsUnavailableError())
          }
          return err(request, {
            code: 'internal',
            message: 'subagent catalog read failed',
            details: {},
          })
        }
      },

      async history(request, signal) {
        const {
          parentSessionId, childSessionId, mode, beforeSeq, maxMessages,
        } = request.payload ?? {}
        const refused = requireNonEmptyString(request, parentSessionId, 'subagent.history requires payload.parentSessionId as a non-empty string')
          ?? requireNonEmptyString(request, childSessionId, 'subagent.history requires payload.childSessionId as a non-empty string')
          ?? requireNonEmptyString(request, mode, 'subagent.history requires payload.mode as a non-empty string')
        if (refused !== undefined) return refused
        const verified = await catalogChild(ctx, {
          parentSessionId, childSessionId, mode,
        }, signal)
        if (verified.error !== undefined) return err(request, verified.error)
        let header
        let events
        let projections
        const attached = ctx.sessions.get(childSessionId)
        if (attached !== undefined) {
          header = attached.header
          events = [...attached.events]
          projections = beforeSeq === undefined
            ? subagentHistoryProjections(ctx, childSessionId, () => projectionsFor(ctx, attached))
            : undefined
        } else {
          try {
            const inspected = await inspectServable(childSessionId)
            header = inspected.meta
            events = inspected.events
            projections = beforeSeq === undefined
              ? subagentHistoryProjections(ctx, childSessionId, () => detachedProjectionsFor(ctx, inspected.events))
              : undefined
          } catch (error) {
            if (signal?.aborted) {
              return err(request, {
                code: 'cancelled',
                message: 'subagent history read was cancelled',
                details: {},
              })
            }
            if (error instanceof SessionNotFound) {
              return err(request, {
                code: 'subagent-not-found',
                message: 'subagent disappeared during history read',
                details: { parentSessionId, childSessionId },
              })
            }
            return err(request, {
              code: 'internal',
              message: 'subagent history read failed',
              details: {},
            })
          }
        }
        if (signal?.aborted) {
          return err(request, {
            code: 'cancelled',
            message: 'subagent history read was cancelled',
            details: {},
          })
        }
        if (header.parentSession !== parentSessionId) {
          return err(request, {
            code: 'subagent-unauthorized',
            message: 'subagent parent changed during history read',
            details: { childSessionId },
          })
        }
        const page = historyPage(ctx, events, beforeSeq, maxMessages)
        return ok(request, { ...page, ...projections === undefined ? {} : { projections } })
      },

      async prompt(request, signal) {
        const { parentSessionId, childSessionId, content, clientTimeZone } = request.payload ?? {}
        const refused = requireNonEmptyString(request, parentSessionId, 'subagent.prompt requires payload.parentSessionId as a non-empty string')
          ?? requireNonEmptyString(request, childSessionId, 'subagent.prompt requires payload.childSessionId as a non-empty string')
        if (refused !== undefined) return refused
        if (!Array.isArray(content)) {
          return badRequest(request, 'subagent.prompt requires payload.content as an array')
        }
        const canonicalTimeZone = clientTimeZone === undefined
          ? undefined
          : canonicalClientTimeZone(clientTimeZone)
        if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
          return err(request, {
            code: 'invalid-time-zone',
            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
            details: { value: clientTimeZone },
          })
        }
        const parent = ctx.agents.get(parentSessionId)
        if (parent === undefined) {
          return err(request, {
            code: 'subagent-parent-unavailable',
            message: `parent session "${parentSessionId}" is not live`,
            details: { parentSessionId },
          })
        }
        const verified = await catalogChild(ctx, {
          parentSessionId, childSessionId, mode: 'continuable',
        }, signal)
        if (verified.error !== undefined) return err(request, verified.error)
        try {
          const messageId = await ctx.subagents.followup(parent, childSessionId, content, {
            source: {
              kind: 'user',
              rpcId: request.rpcId,
              ...(canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone }),
            },
            signal,
          })
          return ok(request, { messageId })
        } catch (error) {
          return subagentPromptError(request, error, signal)
        }
      },

      interrupt(request) {
        const { parentSessionId, childSessionId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, parentSessionId, 'subagent.interrupt requires payload.parentSessionId as a non-empty string')
          ?? requireNonEmptyString(request, childSessionId, 'subagent.interrupt requires payload.childSessionId as a non-empty string')
        if (refused !== undefined) return Promise.resolve(refused)
        try {
          ctx.subagents.interrupt(childSessionId, { kind: 'user', parentSessionId })
        } catch (error) {
          if (error instanceof SubagentError && error.code === 'UNAUTHORIZED') {
            return Promise.resolve(err(request, {
              code: 'subagent-unauthorized',
              message: 'subagent does not belong to this parent',
              details: { childSessionId },
            }))
          }
          return Promise.resolve(err(request, {
            code: 'internal',
            message: 'subagent interrupt failed',
            details: {},
          }))
        }
        return Promise.resolve(ok(request, { accepted: true }))
      },
    },

    workspace: {
      list(request) {
        return Promise.resolve(ok(request, {
          items: ctx.workspaceRegistry.list().map(workspaceView),
          archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds],
        }))
      },

      async create(request) {
        const { path } = request.payload ?? {}
        const refused = requireNonEmptyString(request, path, 'workspace.create requires payload.path as a non-empty string')
        if (refused !== undefined) return refused
        try {
          const { workspace, created } = await ensureWorkspace(path)
          return ok(request, { workspace: workspaceView(workspace), created })
        } catch (error) {
          return err(request, {
            code: 'workspace-invalid-path',
            message: `cannot create a workspace at "${path}": ${error instanceof Error ? error.message : String(error)}`,
            details: { path },
          })
        }
      },

      async rename(request) {
        const { payload } = request
        const refused = requireNonEmptyString(request, payload?.workspaceId, 'workspace.rename requires payload.workspaceId as a non-empty string')
          ?? requireNonEmptyString(request, payload?.title, 'workspace.rename requires payload.title as a non-empty string')
        if (refused !== undefined) return refused
        const workspace = ctx.workspaceRegistry.get(brandWorkspaceId(payload.workspaceId))
        if (workspace === undefined) return workspaceNotFound(request, payload.workspaceId)
        const title = payload.title.trim()
        const operation = workspaceCreationChain.then(async () => {
          if (title === workspace.title) return
          if (ctx.workspaceRegistry.list().some(other => other.id !== workspace.id && other.title === title)) {
            throw new WorkspaceNameConflictError(title)
          }
          await workspace.setTitle(title)
        })
        workspaceCreationChain = operation.then(() => undefined, () => undefined)
        try {
          await operation
        } catch (error) {
          if (error instanceof WorkspaceNameConflictError) {
            return err(request, {
              code: 'workspace-name-conflict',
              message: error.message,
              details: { name: error.workspaceName },
            })
          }
          throw error
        }
        return ok(request, { workspace: workspaceView(workspace) })
      },

      async delete(request) {
        const { workspaceId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, workspaceId, 'workspace.delete requires payload.workspaceId as a non-empty string')
        if (refused !== undefined) return refused
        const operation = workspaceCreationChain.then(() =>
          ctx.workspaceRegistry.delete(brandWorkspaceId(workspaceId)))
        workspaceCreationChain = operation.then(() => undefined, () => undefined)
        if (!await operation) return workspaceNotFound(request, workspaceId)
        return ok(request, { deleted: true })
      },

      async insertBefore(request) {
        const { workspaceId, beforeWorkspaceId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, workspaceId, 'workspace.insertBefore requires payload.workspaceId as a non-empty string')
        if (refused !== undefined) return refused
        try {
          const workspaceIds = await ctx.workspaceRegistry.insertBefore(
            brandWorkspaceId(workspaceId),
            beforeWorkspaceId === undefined ? undefined : brandWorkspaceId(beforeWorkspaceId),
          )
          return ok(request, { workspaceIds: [...workspaceIds] })
        } catch (error) {
          if (!(error instanceof WorkspaceOrderInvalidError)) throw error
          return workspaceNotFound(request, error.workspaceId)
        }
      },

      async insertSessionBefore(request) {
        const { payload } = request
        const refused = requireNonEmptyString(request, payload?.workspaceId, 'workspace.insertSessionBefore requires payload.workspaceId as a non-empty string')
          ?? requireNonEmptyString(request, payload?.sessionId, 'workspace.insertSessionBefore requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        const workspace = ctx.workspaceRegistry.get(brandWorkspaceId(payload.workspaceId))
        if (workspace === undefined) return workspaceNotFound(request, payload.workspaceId)
        try {
          await workspace.insertSessionBefore(payload.sessionId, payload.beforeSessionId)
        } catch (error) {
          if (!(error instanceof WorkspaceMoveInvalidError)) throw error
          return err(request, {
            code: 'workspace-move-invalid',
            message: error.message,
            details: {
              workspaceId: payload.workspaceId,
              sessionId: payload.sessionId,
              ...payload.beforeSessionId === undefined ? {} : { beforeSessionId: payload.beforeSessionId },
            },
          })
        }
        return ok(request, { workspace: workspaceView(workspace) })
      },

      async archiveSession(request) {
        const { sessionId } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'workspace.archiveSession requires payload.sessionId as a non-empty string')
        if (refused !== undefined) return refused
        try {
          await ctx.workspaceRegistry.archiveSession(sessionId)
        } catch (error) {
          if (!(error instanceof WorkspaceUnknownSessionError)) throw error
          return err(request, {
            code: 'session-not-found',
            message: error.message,
            details: { sessionId },
          })
        }
        return ok(request, { archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds] })
      },
    },

    host: {
      describe(request) {
        const selection = defaults.defaultModelSelection()
        return Promise.resolve(ok(request, {
          version: '0.0.1',
          instanceId: PROCESS_INSTANCE_ID,
          cwd: defaults.cwd,
          provider: selection.provider,
          model: selection.model,
          attachedSessions: ctx.agents.list().length,
          home: homedir(),
          canOpenPath: canOpenPaths(),
        }))
      },

      async pickDirectory(request, signal) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'native') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.pickDirectory needs the native capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        try {
          const path = await capability.pick(signal)
          return ok(request, { path })
        } catch (error) {
          if (signal.aborted) {
            return err(request, {
              code: 'cancelled',
              message: 'directory picker was aborted',
              details: {},
            })
          }
          return err(request, {
            code: 'internal',
            message: `directory picker failed: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
          })
        }
      },

      async listDirectory(request, signal) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'browse') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.listDirectory needs the browse capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        try {
          return ok(request, await capability.list(request.payload.path, signal))
        } catch (error) {
          if (signal.aborted) {
            return err(request, { code: 'cancelled', message: 'directory listing was aborted', details: {} })
          }
          return err(request, directoryError(error))
        }
      },

      async createDirectory(request) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'browse') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.createDirectory needs the browse capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        const path = request.payload?.path
        const name = request.payload?.name
        const refused = requireNonEmptyString(request, path, 'host.createDirectory requires payload.path as a non-empty string')
          ?? requireNonEmptyString(request, name, 'host.createDirectory requires payload.name as a non-empty string')
        if (refused !== undefined) return refused
        try {
          return ok(request, { path: await capability.createDirectory(path, name) })
        } catch (error) {
          return err(request, directoryError(error))
        }
      },

      async openPath(request, signal) {
        const path = request.payload?.path
        if (typeof path !== 'string' || path.length === 0) {
          return badRequest(request, 'host.openPath requires payload.path as a non-empty string')
        }
        return openPath(request, path, signal)
      },
    },

    goals: {
      async create(request) {
        const { objective, maxGoalRounds } = request.payload ?? {}
        const refused = requireNonEmptyString(request, objective, 'goal.create requires payload.objective as a non-empty string')
        if (refused !== undefined) return refused
        return mutateGoal(request, (goals, agent) => goals.create(agent, {
          objective,
          ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
        }))
      },

      async edit(request) {
        const { ref, objective, maxGoalRounds } = request.payload ?? {}
        const refused = requireNonEmptyString(request, ref, 'goal.edit requires payload.ref as a non-empty string')
        if (refused !== undefined) return refused
        return mutateGoal(request, (goals, agent) => goals.edit(agent, ref, {
          ...(objective !== undefined ? { objective } : {}),
          ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
        }))
      },

      async pause(request) {
        const refused = requireNonEmptyString(request, request.payload?.ref, 'goal.pause requires payload.ref as a non-empty string')
        if (refused !== undefined) return refused
        return mutateGoal(request, (goals, agent) => goals.pause(agent, request.payload.ref))
      },

      async resume(request) {
        const refused = requireNonEmptyString(request, request.payload?.ref, 'goal.resume requires payload.ref as a non-empty string')
        if (refused !== undefined) return refused
        return mutateGoal(request, (goals, agent) => goals.resume(agent, request.payload.ref))
      },

      async complete(request) {
        const refused = requireNonEmptyString(request, request.payload?.ref, 'goal.complete requires payload.ref as a non-empty string')
        if (refused !== undefined) return refused
        return mutateGoal(request, (goals, agent) => goals.complete(agent, request.payload.ref))
      },

      async clear(request) {
        const sessionId = request.payload?.sessionId
        const refused = requireNonEmptyString(request, sessionId, 'goal.clear requires payload.sessionId as a non-empty string')
          ?? requireNonEmptyString(request, request.payload?.ref, 'goal.clear requires payload.ref as a non-empty string')
        if (refused !== undefined) return refused
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const goals = goalServiceFor(found.agent)
        if ('error' in goals) return err(request, goals.error)
        try {
          goals.clear(found.agent, request.payload.ref)
          return ok(request, { cleared: true })
        } catch (error) {
          return goalError(request, error)
        }
      },
    },

    agentPresets: {
      async list(request) {
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return ok(request, { presets: [], authorable: false, hasDocument: false })
        const defaultId = presets.defaultId
        return ok(request, {
          presets: (await presets.list()).map(preset => ({
            id: preset.id,
            trust: preset.trust,
            isDefault: preset.id === defaultId,
            ...preset.name === undefined ? {} : { name: preset.name },
            ...preset.description === undefined ? {} : { description: preset.description },
            ...preset.broken === undefined ? {} : { broken: preset.broken },
          })),
          authorable: presets.authorable,
          hasDocument: canOpenPaths(),
        })
      },

      async select(request) {
        const { sessionId, agentPreset } = request.payload ?? {}
        const refused = requireNonEmptyString(request, sessionId, 'agentPreset.select requires payload.sessionId as a non-empty string')
          ?? requireNonEmptyString(request, agentPreset, 'agentPreset.select requires payload.agentPreset as a non-empty preset id')
        if (refused !== undefined) return refused
        const presets = ctx.get('agentPresets')
        if (presets === undefined) {
          return err(request, {
            code: 'agent-preset-not-found',
            message: 'this deployment composes no agent presets',
            details: { agentPreset, available: [] },
          })
        }
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const { agent } = found
        const swap = async () => {
          if (!sessionBlank(agent.session)) {
            return err(request, {
              code: 'agent-preset-locked',
              message: `session "${sessionId}" has already started; its agent preset is fixed`,
              details: { sessionId, agentPreset },
            })
          }
          try {
            const preset = await presets.recompose(agent.ctx, agentPreset)
            agent.session.append('agent-preset/selected', { agentPreset: preset.id })
            return ok(request, { agentPreset: preset.id })
          } catch (error) {
            const refused = presetFailure(request, error)
            if (refused !== undefined) return refused
            return err(request, {
              code: 'internal',
              message: `failed to select agent preset "${agentPreset}": ${String(error)}`,
              details: {},
            })
          }
        }
        const queued = presetSwitches.get(sessionId) ?? Promise.resolve()
        const turn = queued.then(swap)
        presetSwitches.set(sessionId, turn.catch(() => undefined))
        try {
          return await turn
        } finally {
          if (presetSwitches.get(sessionId) === turn) presetSwitches.delete(sessionId)
        }
      },

      async read(request) {
        const { agentPreset } = request.payload ?? {}
        const refused = requireNonEmptyString(request, agentPreset, 'agentPreset.read requires payload.agentPreset as a non-empty preset id')
        if (refused !== undefined) return refused
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          const preset = await presets.resolve(agentPreset)
          return ok(request, {
            agentPreset: preset.id,
            trust: preset.trust,
            content: await presets.read(preset.id),
            ...preset.name === undefined ? {} : { name: preset.name },
            ...preset.description === undefined ? {} : { description: preset.description },
          })
        } catch (error) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async copy(request) {
        const { from, agentPreset, name } = request.payload ?? {}
        const refused = requireNonEmptyString(request, from, 'agentPreset.copy requires payload.from as a non-empty preset id')
          ?? requireNonEmptyString(request, agentPreset, 'agentPreset.copy requires payload.agentPreset as a non-empty preset id')
        if (refused !== undefined) return refused
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          await presets.copy(from, agentPreset, name)
          return ok(request, { agentPreset })
        } catch (error) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async openDocument(request, signal) {
        const { agentPreset } = request.payload ?? {}
        const refused = requireNonEmptyString(request, agentPreset, 'agentPreset.openDocument requires payload.agentPreset as a non-empty preset id')
        if (refused !== undefined) return refused
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          const preset = await presets.resolve(agentPreset)
          if (preset.trust !== 'user') {
            throw new PresetNotWritableError(preset.id, 'it ships with the deployment')
          }
          const directory = dirname(preset.path)
          if (!canOpenPaths()) return ok(request, { opened: false, path: directory })
          return await openPath(request, directory, signal)
        } catch (error) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async remove(request) {
        const { agentPreset } = request.payload ?? {}
        if (typeof agentPreset !== 'string' || agentPreset.length === 0) {
          return badRequest(request, 'agentPreset.remove requires payload.agentPreset as a non-empty preset id')
        }
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          await presets.remove(agentPreset)
          return ok(request, {})
        } catch (error) {
          return err(request, presetError(agentPreset, error))
        }
      },
    },

    skills: {
      async list(request) {
        const sessionId = request.payload?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          return badRequest(request, 'skill.list requires payload.sessionId as a non-empty string')
        }
        const session = ctx.sessions.get(sessionId)
        if (session === undefined) {
          return err(request, {
            code: 'session-not-found',
            message: `session "${sessionId}" not found (not attached)`,
            details: { sessionId },
          })
        }
        if (session.header.cwd === undefined) {
          return err(request, { code: 'internal', message: `session "${sessionId}" has no project cwd`, details: {} })
        }
        const cwd = session.header.cwd
        const live = ctx.agents.get(sessionId)
        const presets = ctx.get('agentPresets')
        const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
        const skillRegistry = scoped ?? ctx.get('skills')
        if (skillRegistry === undefined) {
          return err(request, { code: 'internal', message: 'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @freddie/freddie-skill', details: {} })
        }
        const scope = await presenterScopeFor(sessionId, session)
        try {
          const skills = (await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)
          return ok(request, {
            skills: skills.map(skill => ({
              name: skill.name,
              description: skill.description,
              ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
              modelInvocable: skill.invocation.modelInvocable,
            })),
          })
        } catch (error) {
          return err(request, { code: 'internal', message: `skill listing failed: ${String(error)}`, details: {} })
        }
      },
    },

    settings: {
      describe(request) {
        const settings = ctx.get('settings')
        if (settings === undefined) return Promise.resolve(err(request, settingsAbsent()))
        return Promise.resolve(ok(request, {
          writable: settings.writable,
          hasDocument: settings.documentPath !== undefined,
          namespaces: settings.describe({ redactSecrets: true }).map(namespaceView),
        }))
      },
      async openDocument(request, signal) {
        const settings = ctx.get('settings')
        if (settings === undefined) return err(request, settingsAbsent())
        if (isAborted(signal)) {
          return err(request, {
            code: 'cancelled',
            message: 'settings document open was aborted',
            details: {},
          })
        }
        let path
        try {
          path = await settings.prepareDocument()
        } catch (error) {
          if (isAborted(signal)) {
            return err(request, {
              code: 'cancelled',
              message: 'settings document preparation was aborted',
              details: {},
            })
          }
          return err(request, {
            code: 'internal',
            message: `settings document preparation failed: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
          })
        }
        if (path === undefined) {
          return err(request, {
            code: 'internal',
            message: 'settings provider has no local document to open',
            details: {},
          })
        }
        if (isAborted(signal)) {
          return err(request, {
            code: 'cancelled',
            message: 'settings document open was aborted',
            details: {},
          })
        }
        return openTextFile(request, path, signal)
      },
      update(request) {
        const ns = request.payload?.ns
        const refused = requireNonEmptyString(request, ns, 'settings.update requires payload.ns as a non-empty settings namespace')
        if (refused !== undefined) return Promise.resolve(refused)
        return settingsWrite(request, ns, 'update', request.payload.patch, request.payload.expectedRevision)
      },
      replace(request) {
        const ns = request.payload?.ns
        const refused = requireNonEmptyString(request, ns, 'settings.replace requires payload.ns as a non-empty settings namespace')
        if (refused !== undefined) return Promise.resolve(refused)
        return settingsWrite(request, ns, 'replace', request.payload.section, request.payload.expectedRevision)
      },
      mutate(request) {
        const ns = request.payload?.ns
        const refused = requireNonEmptyString(request, ns, 'settings.mutate requires payload.ns as a non-empty settings namespace')
        if (refused !== undefined) return Promise.resolve(refused)
        return settingsWrite(request, ns, 'mutate', request.payload.ops, request.payload.expectedRevision)
      },
    },

    credentials: {
      async describe(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const refs = request.payload?.refs
        if (!Array.isArray(refs)) {
          return badRequest(request, 'credentials.describe requires payload.refs as an array of credential references')
        }
        const entries = await Promise.all(refs.map(async (ref) => {
          const info = await credentials.describe(credentialRef(ref))
          const view = {
            configured: info.configured,
            ...info.source === undefined ? {} : { source: info.source },
            writable: info.writable,
          }
          return [ref, view]
        }))
        return ok(request, { credentials: Object.fromEntries(entries) })
      },

      async set(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const ref = request.payload?.ref
        const value = request.payload?.value
        if (typeof ref !== 'string' || ref.length === 0) {
          return badRequest(request, 'credentials.set requires payload.ref as a non-empty credential reference')
        }
        if (typeof value !== 'string') {
          return badRequest(request, 'credentials.set requires payload.value as a string')
        }
        try {
          await credentials.set(credentialRef(ref), value)
        } catch (error) {
          return err(request, {
            code: 'credential-rejected',
            message: error instanceof Error ? error.message : String(error),
            details: { ref },
          })
        }
        return ok(request, {})
      },

      async unset(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const ref = request.payload?.ref
        if (typeof ref !== 'string' || ref.length === 0) {
          return badRequest(request, 'credentials.unset requires payload.ref as a non-empty credential reference')
        }
        try {
          await credentials.unset(credentialRef(ref))
        } catch (error) {
          return err(request, {
            code: 'credential-rejected',
            message: error instanceof Error ? error.message : String(error),
            details: { ref },
          })
        }
        return ok(request, {})
      },
    },

    terminal: {
      async list(request) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        try {
          return ok(request, { terminals: ctx.terminals.list(owner.agent) })
        } catch (error) {
          return terminalError(request, error)
        }
      },

      async open(request, signal) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        const type = request.payload?.type
        if (typeof type !== 'string' || type.length === 0) return badRequest(request, 'terminal.open requires payload.type as a non-empty string')
        try {
          const terminal = await ctx.terminals.spawn(owner.agent, {
            type,
            ...typeof request.payload?.name === 'string' ? { name: request.payload.name } : {},
            ...typeof request.payload?.cwd === 'string' ? { cwd: request.payload.cwd } : {},
          }, signal)
          subscribeTerminal(owner.agent)
          return ok(request, { terminal })
        } catch (error) {
          return terminalError(request, error)
        }
      },

      async snapshot(request) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        const terminalId = request.payload?.terminalId
        if (typeof terminalId !== 'string' || terminalId.length === 0) return badRequest(request, 'terminal.snapshot requires payload.terminalId as a non-empty string')
        try {
          const terminal = ctx.terminals.list(owner.agent).find(item => item.sessionId === terminalId)
          if (terminal === undefined) return err(request, { code: 'terminal-not-found', message: `terminal ${terminalId} is not owned by this session`, details: {} })
          return ok(request, { terminal, output: ctx.terminals.read(owner.agent, TerminalSessionId(terminalId), { count: 1000 }) })
        } catch (error) {
          return terminalError(request, error)
        }
      },

      async input(request) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        const { terminalId, data } = request.payload ?? {}
        if (typeof terminalId !== 'string' || terminalId.length === 0 || typeof data !== 'string') {
          return badRequest(request, 'terminal.input requires payload.terminalId and payload.data strings')
        }
        if (Buffer.byteLength(data, 'utf8') > 64 * 1024) {
          return badRequest(request, 'terminal.input payload.data must not exceed 65536 UTF-8 bytes')
        }
        try {
          await ctx.terminals.write(owner.agent, TerminalSessionId(terminalId), data)
          return ok(request, { accepted: true })
        } catch (error) {
          return terminalError(request, error)
        }
      },

      async resize(request) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        const { terminalId, cols, rows } = request.payload ?? {}
        if (typeof terminalId !== 'string' || !Number.isSafeInteger(cols) || !Number.isSafeInteger(rows)) {
          return badRequest(request, 'terminal.resize requires terminalId and positive integer cols/rows')
        }
        try {
          return ok(request, { dimensions: await ctx.terminals.resize(owner.agent, TerminalSessionId(terminalId), cols, rows) })
        } catch (error) {
          return terminalError(request, error)
        }
      },

      async close(request) {
        const owner = await terminalOwner(request)
        if (owner.response !== undefined) return owner.response
        const terminalId = request.payload?.terminalId
        if (typeof terminalId !== 'string' || terminalId.length === 0) return badRequest(request, 'terminal.close requires payload.terminalId as a non-empty string')
        try {
          return ok(request, { closed: await ctx.terminals.kill(owner.agent, TerminalSessionId(terminalId), 'browser request') })
        } catch (error) {
          return terminalError(request, error)
        }
      },
    },

    llm: {
      providers(request) {
        const registered = ctx.llm.listProviders()
        const active = new Set(registered.map(provider => provider.id))
        const directory = ctx.llm.listConfigurableProviders()
        const declared = new Set(directory.map(entry => entry.provider))
        const views = directory.map(entry => ({
          provider: entry.provider,
          displayName: entry.displayName,
          settingsNs: entry.settingsNs,
          settingsPath: [...entry.settingsPath],
          active: active.has(entry.provider),
          ...entry.declared === undefined ? {} : { declared: entry.declared },
        }))
        for (const provider of registered) {
          if (declared.has(provider.id)) continue
          views.push({
            provider: provider.id,
            displayName: provider.name,
            settingsNs: '',
            settingsPath: [],
            active: true,
          })
        }
        return Promise.resolve(ok(request, { providers: views }))
      },

      async models(request) {
        return ok(request, await buildModelCatalog(ctx))
      },

      async discoverModels(request, signal) {
        const { settingsNs, provider, baseURL, api, apiKey } = request.payload ?? {}
        const refused = requireNonEmptyString(request, settingsNs, 'llm.discoverModels requires payload.settingsNs as a non-empty settings namespace')
        if (refused !== undefined) return refused
        try {
          const models = await ctx.llm.discoverModels(settingsNs, {
            ...provider === undefined ? {} : { provider },
            ...baseURL === undefined ? {} : { baseURL },
            ...api === undefined ? {} : { api },
            ...apiKey === undefined ? {} : { apiKey },
            ...signal === undefined ? {} : { signal },
          })
          return ok(request, { models })
        } catch (error) {
          return err(request, {
            code: 'model-discovery-failed',
            message: error instanceof Error ? error.message : String(error),
            details: { settingsNs, ...baseURL === undefined ? {} : { baseURL } },
          })
        }
      },
    },

    events: {
      mux(_request, signal) {
        const queue = new FrameQueue({ maxFrames: maxMuxBufferedFrames, maxBytes: maxMuxBufferedBytes })
        muxQueues.add(queue)
        for (const session of ctx.sessions.list()) {
          subscribeSession(queue, session)
        }
        for (const pending of pendingQuestions.values()) {
          queue.push({
            rpcId: pending.rpcId,
            payload: {
              type: 'question/requested', sessionId: pending.sessionId,
              questions: pending.questions,
            },
          })
        }
        for (const pending of pendingApprovals.values()) queue.push(requestedFrame(pending))
        for (const session of ctx.sessions.list()) {
          const agent = ctx.agents.get(session.id)
          if (agent?.session === session && agent.inbox.hasPending) {
            queue.push(frame({ type: 'session/queue', sessionId: session.id, items: queueItems(agent) }))
          }
        }
        const jobs = ctx.get('jobs')
        if (jobs !== undefined) {
          for (const session of ctx.sessions.list()) {
            const views = jobViews(jobs.list(ctx.agents.get(session.id)))
            if (views.length > 0) {
              queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }))
            }
          }
        }
        const openCalls = new Map()
        for (const session of ctx.sessions.list()) {
          const agent = ctx.agents.get(session.id)
          if (agent?.session !== session) continue
          subscribeTerminal(agent)
          for (const terminal of ctx.terminals.list(agent)) {
            queue.push(frame({ type: 'terminal/activity', sessionId: session.id, activity: { type: 'snapshot', snapshot: terminal } }))
          }
        }
        const disposers = [
          ctx.on('session/event', (session, event) => {
            if (event.type === 'tool/call') {
              const data = event.data
              try {
                let table = openCalls.get(session.id)
                if (table === undefined) openCalls.set(session.id, table = new Map())
                table.set(data.callId, { name: data.name, args: JSON.parse(data.arguments) })
              } catch {
              }
            } else if (event.type === 'turn/end') {
              openCalls.delete(session.id)
            }
            const view = viewFor(
              ctx, event,
              callId => openCalls.get(session.id)?.get(callId) ?? backscanArgs(session.events, callId),
              ctx.agents.get(session.id),
            )
            queue.push(frame({ type: 'session/event', sessionId: session.id, event, ...view === undefined ? {} : { view } }))
          }),
          ctx.on('session/created', (session) => {
            subscribeSession(queue, session)
            const agent = ctx.agents.get(session.id)
            if (agent?.session === session) subscribeTerminal(agent)
            const views = jobs === undefined ? [] : jobViews(jobs.list(ctx.agents.get(session.id)))
            if (views.length > 0) {
              queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }))
            }
          }),
          ctx.on('session/disposed', (session) => {
            openCalls.delete(session.id)
          }),
          ...jobs === undefined ? [] : [jobs.onJobsChanged((owner) => {
            if (owner !== undefined) {
              queue.push(frame({ type: 'session/jobs', sessionId: owner.id, jobs: jobViews(jobs.list(owner)) }))
              return
            }
            for (const session of ctx.sessions.list()) {
              queue.push(frame({
                type: 'session/jobs',
                sessionId: session.id,
                jobs: jobViews(jobs.list(ctx.agents.get(session.id))),
              }))
            }
          })],
        ]
        return queue.iterate(signal, () => {
          muxQueues.delete(queue)
          for (const dispose of disposers) dispose()
        })
      },

      host(_request, signal) {
        const queue = new FrameQueue({ maxFrames: maxMuxBufferedFrames, maxBytes: maxMuxBufferedBytes })
        const committedWorkspaces = ctx.workspaceRegistry.list()
        const committedWorkspaceIds = new Set(
          committedWorkspaces.map(workspace => String(workspace.id)),
        )
        let committedWorkspaceOrder = committedWorkspaces.map(workspace => workspace.id)
        let archivedSessionIds = ctx.workspaceRegistry.archivedSessionIds
        const disposers = [
          ctx.on('session/created', (session) => {
            queue.push(frame({
              type: 'host/session-added',
              sessionId: session.id,
              blank: sessionBlank(session),
              ...sessionListFields(session.header, session.events),
            }))
          }),
          ctx.on('session/disposed', (session) => {
            queue.push(frame({ type: 'host/session-removed', sessionId: session.id }))
          }),
          ctx.on('agent/status', ({ agent, status }) => {
            const running = status === 'running'
            const errored = running ? false : sessionListMetadata(agent.session.events).errored
            queue.push(frame({ type: 'host/session-status', sessionId: agent.id, running, errored }))
          }),
          ctx.on('agent/error', ({ agent, error }) => {
            queue.push(frame({ type: 'host/agent-error', sessionId: agent.id, message: errorChain(error) }))
          }),
          ctx.on('domain/changed', (change) => {
            if (change.domain !== 'workspace') return
            if (change.table === '') {
              if (change.operation !== 'put') return
              const state = workspaceDomainState.parse(change.value)
              const orderChanged = state.workspaceIds.length === committedWorkspaceOrder.length
                && state.workspaceIds.every(workspaceId => committedWorkspaceIds.has(String(workspaceId)))
                && state.workspaceIds.some((workspaceId, index) => workspaceId !== committedWorkspaceOrder[index])
              for (const workspaceId of state.workspaceIds) {
                if (committedWorkspaceIds.has(workspaceId)) continue
                const workspace = ctx.workspaceRegistry.get(workspaceId)
                if (workspace === undefined) {
                  throw new Error(`committed workspace registry references missing workspace "${workspaceId}"`)
                }
                committedWorkspaceIds.add(workspaceId)
                queue.push(frame({ type: 'host/workspace-changed', workspace: workspaceView(workspace) }))
              }
              committedWorkspaceOrder = [...state.workspaceIds]
              if (orderChanged) {
                queue.push(frame({
                  type: 'host/workspace-order-changed',
                  workspaceIds: [...state.workspaceIds],
                }))
              }
              if (state.archivedSessionIds.length !== archivedSessionIds.length
                || state.archivedSessionIds.some((id, index) => id !== archivedSessionIds[index])) {
                archivedSessionIds = state.archivedSessionIds
                queue.push(frame({
                  type: 'host/archived-sessions-changed',
                  archivedSessionIds: [...state.archivedSessionIds],
                }))
              }
              return
            }
            if (change.table !== 'workspaces') return
            if (change.operation === 'deleted') {
              if (!committedWorkspaceIds.delete(change.key)) return
              queue.push(frame({
                type: 'host/workspace-removed',
                workspaceId: change.key,
              }))
              return
            }
            if (!committedWorkspaceIds.has(change.key)) return
            queue.push(frame({
              type: 'host/workspace-changed',
              workspace: changedWorkspaceView(change.key, change.value),
            }))
          }),
          ...API_REMOTE_FORWARDED_EVENTS.map(name => ctx.on(
            name,
            ((...args) => {
              queue.push(frame({
                type: 'host/remote-event',
                event: name,
                args: assertJsonArgs(name, args),
              }))
            }),
          )),
        ]
        return queue.iterate(signal, () => { for (const dispose of disposers) dispose() })
      },
    },

    downloads: {
      async sessionLog(request, signal) {
        const deps = sessionLogExportDeps(ctx)
        if (deps.sessionQuery === undefined || deps.sessionPersistence === undefined || deps.attachments === undefined) {
          return new Response(
            'session log export is unavailable: missing session-query, session-persistence, or attachments service',
            { status: 500 },
          )
        }
        if (!deps.sessionPersistence.supportsRawArtifacts) {
          return new Response(
            'session log export is unavailable: the persistence backend does not expose per-session raw artifacts',
            { status: 501 },
          )
        }
        const ready = {
          sessionQuery: deps.sessionQuery,
          sessionPersistence: deps.sessionPersistence,
          attachments: deps.attachments,
          sessions: deps.sessions,
        }
        let root
        try {
          await flushLiveSessionLog(deps, request.sessionId, signal)
          root = await deps.sessionPersistence.readRaw(request.sessionId, signal)
          signal.throwIfAborted()
        } catch {
          signal.throwIfAborted()
          return new Response('session log export failed to prepare the stored artifact', { status: 500 })
        }
        if (root === undefined) {
          return new Response('session not found', { status: 404 })
        }
        return new Response(
          streamSessionLogZip(
            ready,
            root,
            request.sessionId,
            request.includeDescendants === true,
            sessionExportCompressionLevel,
            signal,
          ),
          {
            headers: {
              'content-type': 'application/zip',
              'content-disposition': `attachment; filename="${sessionLogZipFilename(request.sessionId)}"`,
            },
          },
        )
      },
    },

    respond(message) {
      const approval = pendingApprovals.get(message.rpcId)
      if (approval !== undefined) {
        if (!message.result.ok) return Promise.resolve({ accepted: false, reason: 'bad-response' })
        const parsed = toApprovalResponsePayload(message.result.value)
        if (!parsed || parsed.approvalId !== approval.approvalId || parsed.sessionId !== approval.sessionId) {
          return Promise.resolve({ accepted: false, reason: 'bad-response' })
        }
        approval.resolve(parsed.outcome)
        return Promise.resolve({ accepted: true })
      }
      const pending = pendingQuestions.get(message.rpcId)
      if (pending === undefined) return Promise.resolve({ accepted: false, reason: 'not-pending' })
      if (!message.result.ok) {
        if (message.result.error.code !== 'cancelled') {
          return Promise.resolve({ accepted: false, reason: 'bad-response' })
        }
        claimQuestion(pending, 'cancelled')
        pending.reject(new UserQuestionError(
          'the user cancelled ask_user_question', 'ASK_CANCELLED'))
        return Promise.resolve({ accepted: true })
      }
      const value = message.result.value
      const payload = {
        sessionId: value.sessionId,
        answer: {
          answers: value.answer.answers.map(answer => ({
            id: answer.id,
            selected: answer.selected,
            ...(answer.custom === undefined ? {} : { custom: answer.custom }),
          })),
        },
      }
      if (!matchesQuestions(payload, pending)) {
        return Promise.resolve({ accepted: false, reason: 'bad-response' })
      }
      claimQuestion(pending, 'answered')
      pending.resolve(payload.answer)
      return Promise.resolve({ accepted: true })
    },
  }
}
