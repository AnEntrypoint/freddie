import { Context, Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import {
  createApiProxy, DEFAULT_COLD_BLANK_PROBE_MAX_BYTES,
  DEFAULT_MAX_MUX_BUFFERED_BYTES, DEFAULT_MAX_MUX_BUFFERED_FRAMES,
} from './api-proxy.js'
import {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
} from './session-export.js'

export * from './api/index.js'
export { RpcId } from './api/rpc.js'
export { toFetchHandler } from './fetch/handler.js'
export { AbstractApiClient, InProcessApiClient } from './fetch/client.js'
export { createApiProxy } from './api-proxy.js'

export class ApiProxyService extends Service {
  static inject = [
    'agentDefaultModel', 'agents', 'attachments', 'directoryPicker', 'llm', 'sessions', 'subagents', 'sessionQuery',
    'terminals', 'tools', 'userQuestions', 'workspaceRegistry',
  ]

  static Config = z.object({
    nativeOpen: z.boolean(),
    sessionExportCompressionLevel: z.number().step(1).min(0).max(9)
      .default(DEFAULT_SESSION_LOG_COMPRESSION_LEVEL),
    coldBlankProbeMaxBytes: z.natural().default(DEFAULT_COLD_BLANK_PROBE_MAX_BYTES),
    maxMuxBufferedFrames: z.natural().min(1).default(DEFAULT_MAX_MUX_BUFFERED_FRAMES),
    maxMuxBufferedBytes: z.natural().min(1).default(DEFAULT_MAX_MUX_BUFFERED_BYTES),
  })

  coldBlankProbeMaxBytes
  sessions
  subagents
  workspace
  host
  goals
  skills
  agentPresets
  settings
  credentials
  llm
  events
  downloads
  respond

  constructor(ctx, config) {
    super(ctx, 'apiProxy')
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ctx.agentDefaultModel.currentSelection(),
      saveDefaultModelSelection: selection => ctx.agentDefaultModel.saveSelection(selection),
      cwd: process.cwd(),
      ...config.nativeOpen === undefined ? {} : { canOpenPath: () => config.nativeOpen },
      ...(config.sessionExportCompressionLevel === undefined
        ? {}
        : { sessionExportCompressionLevel: config.sessionExportCompressionLevel }),
      ...(config.coldBlankProbeMaxBytes === undefined
        ? {}
        : { coldBlankProbeMaxBytes: config.coldBlankProbeMaxBytes }),
      ...(config.maxMuxBufferedFrames === undefined
        ? {}
        : { maxMuxBufferedFrames: config.maxMuxBufferedFrames }),
      ...(config.maxMuxBufferedBytes === undefined
        ? {}
        : { maxMuxBufferedBytes: config.maxMuxBufferedBytes }),
    })
    this.coldBlankProbeMaxBytes = config.coldBlankProbeMaxBytes
    this.sessions = api.sessions
    this.subagents = api.subagents
    this.terminal = api.terminal
    this.workspace = api.workspace
    this.host = api.host
    this.goals = api.goals
    this.skills = api.skills
    this.agentPresets = api.agentPresets
    this.settings = api.settings
    this.credentials = api.credentials
    this.llm = api.llm
    this.events = api.events
    this.downloads = api.downloads
    this.respond = api.respond.bind(api)
  }
}

export default ApiProxyService
