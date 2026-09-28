/** Host HTTP bridge for browser-client RPC. */
import z from '@freddie/schemastery'
// Activates the webServer Context merge used below.
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

/**
 * Methods gated to loopback even on a trusted-host deployment. Native dialogs
 * act on the host machine; the settings and credential domains mutate the
 * user's configuration and secret store, and READING them is equally
 * privileged — `settings.describe` returns every exposed namespace's
 * configuration and `credentials.describe` reports whether an arbitrary
 * environment-variable name is configured and where from, which is
 * reconnaissance no anonymous caller should have. `trustedHosts` is a
 * DNS-rebinding fence, explicitly not authentication, so the whole
 * configuration plane stays loopback-same-origin until a real authentication
 * layer exists. `llm.discoverModels` belongs to that plane on both counts: it
 * carries a draft credential, and it makes the HOST issue a GET to a URL the
 * caller chose and reports back the status or the parsed body — an anonymous
 * LAN caller would have a probe for whatever the host can reach and the
 * browser cannot.
 *
 * The model catalog (`llm.providers`, `llm.models`) is deliberately NOT here:
 * it carries provider ids, display names, and model lists — no endpoints,
 * keys, or key state — and a LAN client's model picker legitimately needs it.
 *
 * Left unpinned on the same reasoning: `goals.*`, `messageFeedback.*`,
 * `pluginInventory.list`, `commands.list`, `fileReferences.list`, and
 * `sessionArtifacts.{list,put,deleteArtifact}` read or write state the calling
 * session already owns — `pluginInventory.list` carries module names and fiber
 * phases and no configuration — and a caller who may create and prompt a
 * session through the unpinned `session.*` routes already reaches every one of
 * them through that session's own agent. Pinning them would be a fence beside
 * an open gate.
 */
const PRIVILEGED_METHODS = new Set([
  // A preset composition names the plugins a session runs, so reading one is
  // reconnaissance; copy and remove rearrange what the deployment offers, and
  // openDocument drives the host desktop — all more than the roster beside
  // them. (Authoring is copy-only, so no method here accepts composition text
  // or a path; the pin is about who may manage the roster at all.)
  //
  // CHOOSING one is not pinned, and `agentPreset.list` is not either. Picking a
  // preset looks like escalation — one of them mounts the toolset that edits the
  // live runtime — but `session.create` already takes an `agentPreset`, so
  // pinning only the switch would leave the same capability one method over.
  // The deeper reason is that the capability is not the preset's to grant: the
  // deployment's own default already carries `bash` and the filesystem tools, so
  // any caller that may start a session at all can already run commands as this
  // process. Pinning the switch would be a fence beside an open gate.
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
  // The terminal namespace is pinned whole, so it is listed once: every legacy
  // `terminal.*` route already was, `terminal/create` allocates a shell on the
  // host and `terminal/write` feeds it input, so leaving either unpinned lets a
  // trusted host spawn and drive a host shell. `environment` and `shells` are
  // the same reconnaissance class `settings.describe` is pinned for. Three of
  // the dotted names have no namespaced counterpart and stay for the legacy
  // routes that still serve them.
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
  // The Typert controllers reach the same Host state through namespaced
  // endpoints (`settings/describe`) where the legacy routes used a dot
  // (`settings.describe`). One canonical spelling, derived at the check below,
  // keeps this list authoritative for both, so no controller slips outside it
  // by differing in punctuation. The namespaces mirror the capability the
  // dotted entries already pin — deployment configuration and credentials —
  // and add the surfaces the controllers opened with no dotted ancestor:
  // reading bytes out of the workspace, rearranging the workspace itself, and
  // a directory picker able to drive the host's native dialog, which is the
  // same capability `host.pickDirectory` above is pinned for.
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
  'directoryPicker.pick',
  'directoryPicker.list',
  'directoryPicker.createDirectory',
  // `dynamicCordisRunner` is pinned whole because the namespace is one
  // capability: loading a Cordis package's HOST half into this process and then
  // calling into it. `runHostHalf` and `invoke` are host-side code execution
  // with no model in the loop, and the verbs that look like bookkeeping —
  // `resolveRequestRun`, `resolveInspectQuery`, `syncInspectManifest`,
  // `settleUserRun` — are steps of that same activation pipeline, while
  // `getClientCode`, `inventory`, `stopFromPanel`, `undefineFromPanel` and the
  // two report verbs disclose or change which host code is live. Pinning a
  // subset would leave the pipeline reachable one verb over.
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
  // `gm.*` is pinned whole: all five write the deployment's own durable
  // workflow state (`.gm/prd.yml`, `.gm/mutable*.yml`) under the process cwd —
  // host filesystem writes outside any session's grant — and `gm.transition`
  // additionally advances the phase machine whose gates gate everything else.
  'gm.prdAdd',
  'gm.prdResolve',
  'gm.mutableAdd',
  'gm.mutableResolve',
  'gm.transition',
  // Two verbs whose effect is a direct host action rather than a turn through
  // the session's model: `commands.execute` runs a command handler in this
  // process from caller-supplied text, and the roster Web mounts includes one
  // that reads a session log off the host; `job.kill` terminates a host
  // background process. `commands.list` beside them is a descriptor catalog and
  // stays reachable.
  'commands.execute',
  'job.kill',
  // `sessionArtifacts.share` grants or revokes one artifact to a session the
  // caller does not own — the only verb in that namespace whose effect crosses
  // a session boundary. `list`, `put` and `deleteArtifact` stay inside the
  // caller's own session store.
  'sessionArtifacts.share',
  // `sessionReferenceResolver.candidates` rows carry every visible session's id,
  // cwd and title, so it discloses host paths and titles of sessions the caller
  // does not own. `fileReferences.list` is deliberately not beside it: that one
  // enumerates paths inside the calling session's own cwd grant.
  'sessionReferenceResolver.candidates',
  // Deliberately NOT pinned, recorded so the omission reads as a choice rather
  // than as a gap: `session.list`, `session.search`, `session.page` and
  // `session.projections` disclose every session's id, cwd and title — and
  // `page` its content by id — so a configured LAN host can read the whole
  // conversation history. They stay reachable because the browser client is
  // itself that caller: a LAN deployment's own session list, search and
  // transcript paging go through exactly these, so pinning them breaks the
  // product instead of closing a hole. This is the largest residual exposure on
  // a trusted-host deployment, and `trustedHosts` is a DNS-rebinding fence, not
  // authentication — a deployment that needs this closed needs an auth layer,
  // not another entry here. `session.modelCatalog`, `fileReferences.list`,
  // `messageFeedback.*`, `goals.*`, `pluginInventory.list`, `commands.list` and
  // `sessionArtifacts.list|put|deleteArtifact` are unpinned for the opposite
  // reason: each is confined to the calling session's own store.
])

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
  // The Loader resolves schema defaults; hand-built test contexts may pass none.
  const trustedHosts = config?.trustedHosts ?? []
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  if (ctx.get('apiProxy') !== undefined) assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  const connection = new HostConnectionService(ctx, trustedHosts)
  // The privilege pin belongs in front of the shared-channel dispatch, not
  // inside the fallback: a Typert endpoint is claimed by the gateway's
  // interceptor and never reaches the fallback, so a check placed there leaves
  // every namespaced controller endpoint reachable from any trusted host.
  const sharedFetchHandler = connection.createSharedFetchHandler(API_PATH, {
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
  const fetchHandler = {
    async fetch(request) {
      const method = apiMethodOf(request)
      if (method !== undefined
        && PRIVILEGED_METHODS.has(canonicalMethodName(method))
        && !isTrustedApiRequest(request, [])) {
        return new Response('forbidden', { status: 403 })
      }
      return sharedFetchHandler.fetch(request)
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
      await bridge(req, res, fetchHandler, maxRequestBodyBytes)
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
