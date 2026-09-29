/** Host HTTP bridge for browser-client RPC. */
import z from '@freddie/schemastery'
import { toFetchHandler } from '@freddie/freddie-host-apiproxy'
import { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.js'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.js'
import { assertTrustedAuthority, isTrustedApiRequest } from './api-request-trust.js'
import { HostConnectionService } from './rpc-host.js'
import { rejectWebSocketUpgrade, WebSocketDownlinks } from './websocket-downlink.js'

export { HostConnectionService } from './rpc-host.js'

export { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.js'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024

function assertImageBodyCapacity(ctx, maxRequestBodyBytes) {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection; API Proxy is an optional `/api` fallback. */
export const inject = ['webServer']

export const Config = z.object({
  trustedHosts: z.array(String).default([]),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
})

const AGENT_PRESET_ROSTER_MANAGEMENT = [
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
]

const HOST_DESKTOP_AND_FILESYSTEM_ACCESS = [
  'host.pickDirectory',
  'host.openPath',
  'host.listDirectory',
  'host.createDirectory',
  'directoryPicker.pick',
  'directoryPicker.list',
  'directoryPicker.createDirectory',
]

const DEPLOYMENT_CONFIGURATION = [
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'pluginManager.describe',
  'pluginManager.setDisabled',
]

const CREDENTIALS_AND_CREDENTIALED_PROBES = [
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
]

const HOST_SHELL = [
  'terminal.list',
  'terminal.open',
  'terminal.snapshot',
  'terminal.input',
  'terminal.resize',
  'terminal.close',
  'terminal.environment',
  'terminal.shells',
  'terminal.create',
  'terminal.write',
]

const WORKSPACE_FILESYSTEM = [
  'workspaceFiles.stat',
  'workspaceFiles.read',
  'workspaceFiles.readBytes',
  'workspaceFiles.list',
  'workspace.list',
  'workspace.create',
  'workspace.rename',
  'workspace.delete',
  'workspace.insertBefore',
  'workspace.insertSessionBefore',
  'workspace.archiveSession',
]

const HOST_CODE_ACTIVATION = [
  'dynamicCordisRunner.getClientCode',
  'dynamicCordisRunner.inventory',
  'dynamicCordisRunner.invoke',
  'dynamicCordisRunner.reportClientGuardFailure',
  'dynamicCordisRunner.reportRenderFailure',
  'dynamicCordisRunner.resolveInspectQuery',
  'dynamicCordisRunner.resolveRequestRun',
  'dynamicCordisRunner.runHostHalf',
  'dynamicCordisRunner.settleUserRun',
  'dynamicCordisRunner.stopFromPanel',
  'dynamicCordisRunner.syncInspectManifest',
  'dynamicCordisRunner.undefineFromPanel',
]

const WORKFLOW_STATE_WRITES = [
  'gm.prdAdd',
  'gm.prdResolve',
  'gm.mutableAdd',
  'gm.mutableResolve',
  'gm.transition',
]

const DIRECT_HOST_ACTIONS = [
  'commands.execute',
  'job.kill',
]

const CROSS_SESSION_DISCLOSURE = [
  'sessionArtifacts.share',
  'sessionReferenceResolver.candidates',
]

/**
 * Methods gated to loopback even on a trusted-host deployment. `trustedHosts` is
 * a DNS-rebinding fence, not authentication, so reading or changing deployment
 * configuration, secrets, the host filesystem or host processes stays
 * loopback-only. Every group above is one capability; the reasoning is in this
 * package's AGENTS.md.
 */
const PRIVILEGED_METHODS = new Set([
  ...AGENT_PRESET_ROSTER_MANAGEMENT,
  ...HOST_DESKTOP_AND_FILESYSTEM_ACCESS,
  ...DEPLOYMENT_CONFIGURATION,
  ...CREDENTIALS_AND_CREDENTIALED_PROBES,
  ...HOST_SHELL,
  ...WORKSPACE_FILESYSTEM,
  ...HOST_CODE_ACTIVATION,
  ...WORKFLOW_STATE_WRITES,
  ...DIRECT_HOST_ACTIONS,
  ...CROSS_SESSION_DISCLOSURE,
])

/**
 * Methods left reachable from a trusted host because the browser client is the
 * caller, or because each is confined to the calling session. Listed so that an
 * omission from {@link PRIVILEGED_METHODS} reads as a decision.
 */
export const UNPINNED_BY_DECISION = Object.freeze([
  'session.list',
  'session.search',
  'session.page',
  'session.projections',
  'session.create',
  'session.fork',
  'session.prompt',
  'session.cancel',
  'session.attachment',
  'session.updateQueue',
  'session.selectModel',
  'session.rename',
  'session.follow',
  'session.control',
  'session.history',
  'session.models',
  'session.export',
  'session.modelCatalog',
  'stream.next',
  'stream.close',
  'respond',
  'agentPreset.list',
  'agentPreset.select',
  'llm.providers',
  'llm.models',
  'fileReferences.list',
  'pluginInventory.list',
  'commands.list',
  'sessionArtifacts.list',
  'sessionArtifacts.put',
  'sessionArtifacts.deleteArtifact',
  'sessionArtifacts.checkpoints',
])

for (const method of UNPINNED_BY_DECISION) {
  if (PRIVILEGED_METHODS.has(method)) {
    throw new Error(`client-connection: ${method} is both pinned to loopback and unpinned by decision`)
  }
}

/**
 * Fail the load on a `trustedHosts` entry that is not a bare authority, rather than authorizing its hostname prefix at request time.
 * @param trustedHosts - configured non-loopback authorities.
 */
function refuseMalformedTrustedHosts(trustedHosts) {
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
}

/**
 * The `/api` endpoint a request addresses.
 * @param request - inbound HTTP request.
 * @returns the endpoint text following the `/api/` prefix; undefined outside it.
 */
function apiMethodOf(request) {
  const pathname = new URL(request.url).pathname
  return pathname.startsWith(`${API_PATH}/`) ? pathname.slice(API_PATH.length + 1) : undefined
}

/**
 * The canonical spelling of one endpoint name, so the privilege list is
 * authoritative for the legacy dotted routes and the namespaced ones alike.
 * @param method - an endpoint as it appears after the `/api/` prefix.
 * @returns the dotted spelling.
 */
function canonicalMethodName(method) {
  return method.replace(/\//g, '.')
}

/**
 * Mounts the API gateway under the browser transport prefix. Every request on
 * the prefix passes the browser-trust fence first (DNS-rebinding and
 * cross-site defense — [api-request-trust](./api-request-trust.js));
 * privileged methods additionally pass it with an empty trust list, which
 * pins them to loopback.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config) {
  const { trustedHosts = [], maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES } = config ?? {}
  refuseMalformedTrustedHosts(trustedHosts)
  if (ctx.get('apiProxy') !== undefined) assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  const connection = new HostConnectionService(ctx, trustedHosts)
  const channelDispatch = connection.createSharedFetchHandler(API_PATH, {
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      if (request.method === 'GET' && (pathname === MUX_EVENTS_PATH || pathname === HOST_EVENTS_PATH)) {
        return new Response('upgrade required', {
          status: 426,
          headers: { connection: 'Upgrade', upgrade: 'websocket' },
        })
      }
      const apiProxy = ctx.get('apiProxy')
      if (apiProxy === undefined) return new Response('not found', { status: 404 })
      return toFetchHandler(apiProxy).fetch(request)
    },
  })
  const pinnedFetchHandler = {
    async fetch(request) {
      const method = apiMethodOf(request)
      if (method !== undefined
        && PRIVILEGED_METHODS.has(canonicalMethodName(method))
        && !isTrustedApiRequest(request, [])) {
        return new Response('forbidden', { status: 403 })
      }
      return channelDispatch.fetch(request)
    },
  }
  const route = {
    kind: 'prefix',
    path: API_PATH,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, trustedHosts)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      await bridge(req, res, pinnedFetchHandler, maxRequestBodyBytes)
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'client-connection: /api route')
  ctx.inject(['apiProxy'], (apiCtx) => {
    assertImageBodyCapacity(apiCtx, maxRequestBodyBytes)
    const downlinks = new WebSocketDownlinks(apiCtx.apiProxy)
    const registerDownlink = (
      path,
      handle,
    ) => {
      apiCtx.effect(() => apiCtx.webServer.registerUpgrade({
        path,
        handler: (req, socket, head) => {
          if (!isTrustedApiRequest(req, trustedHosts)) {
            rejectWebSocketUpgrade(socket)
            return
          }
          return handle(req, socket, head)
        },
      }), `client-connection: ${path} WebSocket`)
    }
    apiCtx.effect(() => () => downlinks.close(), 'client-connection: WebSocket downlinks')
    registerDownlink(MUX_EVENTS_PATH, (req, socket, head) => { downlinks.handleMux(req, socket, head) })
    registerDownlink(HOST_EVENTS_PATH, (req, socket, head) => { downlinks.handleHost(req, socket, head) })
  })
}
