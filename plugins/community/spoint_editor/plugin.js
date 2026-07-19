// Freddie tool plugin driving a real spoint game-server editor session over its actual wire
// protocol (msgpackr WebSocket at ws://<host>:<port>/ws). Protocol reverse-engineered from the
// real spoint source at the sibling C:/dev/spoint checkout -- see wire.js's header comment for
// full file:line citations. Three tools:
//   - spoint_place: real PLACE_MODEL (0x82) / PLACE_APP (0x83) editor messages
//     (src/sdk/EditorHandlers.js HANDLERS[MSG.PLACE_MODEL]/HANDLERS[MSG.PLACE_APP])
//   - spoint_terrain_reseed: real TERRAIN_RESEED (0x9b) message
//     (src/sdk/EditorHandlers.js HANDLERS[MSG.TERRAIN_RESEED]) -- the ONLY real terrain-adjacent
//     editor endpoint that exists server-side; no live per-field terrain-config-value edit
//     endpoint exists (confirmed by reading every HANDLERS entry in EditorHandlers.js), so this
//     tool is honestly scoped to seed reroll only rather than inventing a fake field-edit call.
//   - spoint_lint_world: no server-side lint endpoint exists (same HANDLERS audit); fetches a
//     live SCENE_GRAPH (0x89 reply) + APP_LIST (0x85 reply, requested via LIST_APPS 0x84) and
//     runs the SAME 4 checks spoint's own client/editor/WorldValidator.js lintWorld() runs,
//     ported verbatim in lint.js with per-check file:line citations.
//
// Auth: spoint gates every editor-namespaced message (EditorHandlers.HANDLED_TYPES) behind a
// per-connection isEditor flag (src/sdk/ServerHandlers.js:42,196-207). That flag is true
// automatically when the target server has no EDITOR_TOKEN configured (open dev default), or
// set via a real AUTH_EDITOR (0x9d) handshake carrying the correct token. This plugin always
// attempts that handshake when a token is configured (ctx.env('EDITOR_TOKEN')) and proceeds
// unauthenticated otherwise -- matching the real server-side default exactly, never assuming
// either posture.

import { connectEditor, MSG } from './wire.js'
import { lintWorld } from './lint.js'

// Defense-in-depth: plugin.json declares resources.network_hosts, but src/host/tool-
// resources.js's withResourceEnforcement only patches globalThis.fetch (and fs read/write) --
// it has no WebSocket-construction gate (see spoint-editor-selfcheck-host-allowlist PRD row /
// host-websocket-resource-enforcement follow-up). Self-check against the SAME declared list
// here so this plugin's own behavior matches its manifest even before the host gains real
// enforcement for WS.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1'])
function assertHostAllowed(host) {
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`spoint_editor: host '${host}' not in this plugin's declared network_hosts allowlist [${[...ALLOWED_HOSTS].join(', ')}] (plugin.json resources.network_hosts) -- refusing to connect`)
  }
}

function resolveTarget(ctx, args) {
  const host = args.host || ctx.env('SPOINT_HOST') || '127.0.0.1'
  const port = Number(args.port || ctx.env('SPOINT_PORT') || 3000)
  assertHostAllowed(host)
  const token = ctx.env('EDITOR_TOKEN') || undefined
  return { host, port, token }
}

async function withSession(ctx, args, fn) {
  const { host, port, token } = resolveTarget(ctx, args)
  const session = connectEditor({ host, port, token })
  try {
    await session.ready
    await session.authIfNeeded()
    return await fn(session)
  } finally {
    session.close()
  }
}

const placeTool = {
  name: 'spoint_place',
  toolset: 'community',
  schema: {
    name: 'spoint_place',
    description: "Place an entity in a running spoint game-server world via its real editor protocol (PLACE_MODEL/PLACE_APP). 'kind':'model' places a raw GLB URL as a trimesh-collided static entity; 'kind':'app' places a registered app (or a built-in primitive: box-static/sphere-static/capsule-static/cylinder-static). Returns the real server-assigned entityId on success.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['model', 'app'] },
        urlOrAppName: { type: 'string', description: "GLB url when kind='model'; app name (or a *-static primitive) when kind='app'" },
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[x,y,z] world position' },
        config: { type: 'object', description: "kind='app' only: seeds the placed app's editorProp config" },
        host: { type: 'string', description: 'spoint server host, default 127.0.0.1' },
        port: { type: 'number', description: 'spoint server port, default 3000' },
      },
      required: ['kind', 'urlOrAppName'],
    },
  },
  handler: async (args, ctx) => {
    if (!args || (args.kind !== 'model' && args.kind !== 'app')) return { error: "kind must be 'model' or 'app'" }
    if (!args.urlOrAppName || typeof args.urlOrAppName !== 'string') return { error: 'urlOrAppName required' }
    const position = Array.isArray(args.position) && args.position.length === 3 ? args.position : [0, 0, 0]
    return withSession(ctx, args, async (session) => {
      const msgType = args.kind === 'model' ? MSG.PLACE_MODEL : MSG.PLACE_APP
      const payload = args.kind === 'model'
        ? { url: args.urlOrAppName, position }
        : { appName: args.urlOrAppName, position, config: args.config || undefined }
      const { type, payload: reply } = await session.request(msgType, payload, [MSG.EDITOR_SELECT, MSG.EDITOR_ERROR])
      if (type === MSG.EDITOR_ERROR) return { error: reply?.message || 'placement rejected by server', detail: reply }
      if (!reply || reply.entityId == null) return { error: reply?.error || 'server did not return an entityId', detail: reply }
      return { entityId: reply.entityId, position, kind: args.kind, editorProps: reply.editorProps || null }
    })
  },
}

const terrainReseedTool = {
  name: 'spoint_terrain_reseed',
  toolset: 'community',
  schema: {
    name: 'spoint_terrain_reseed',
    description: "Reseed a running spoint world's terrain (real TERRAIN_RESEED editor message) -- the only real terrain-adjacent editor endpoint spoint's server exposes. This rerolls the WHOLE terrain (a full sampler/frame/heightFn re-derivation from the new seed), broadcast to every connected client; there is no per-field terrain-config-value edit endpoint on the server to change (e.g.) just amplitude or octaves in isolation.",
    parameters: {
      type: 'object',
      properties: {
        seed: { type: 'integer', description: 'new integer terrain seed' },
        host: { type: 'string' },
        port: { type: 'number' },
      },
      required: ['seed'],
    },
  },
  handler: async (args, ctx) => {
    if (!Number.isFinite(args?.seed)) return { error: 'seed must be a finite integer' }
    return withSession(ctx, args, async (session) => {
      const { payload: reply } = await session.request(MSG.TERRAIN_RESEED, { seed: args.seed | 0 }, [MSG.TERRAIN_CONFIG], { timeoutMs: 20000 })
      if (!reply?.ok) return { error: reply?.error || 'terrain reseed failed', detail: reply }
      return { ok: true, config: reply.config }
    })
  },
}

const lintTool = {
  name: 'spoint_lint_world',
  toolset: 'community',
  schema: {
    name: 'spoint_lint_world',
    description: "Lint the currently-loaded world on a running spoint server for common authoring mistakes -- the SAME 4 checks spoint's own in-editor 'Validate World' panel runs (client/editor/WorldValidator.js), re-implemented here against a live-fetched scene graph since no server-side lint endpoint exists: out-of-bounds entity position (>50000u from origin), missing spawn-point/respawn-zone entity, duplicate entity ids, and an entity referencing an unknown/unregistered app name.",
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
      },
    },
  },
  handler: async (args, ctx) => {
    return withSession(ctx, args || {}, async (session) => {
      const [{ payload: sceneReply }, { payload: appsReply }] = await Promise.all([
        session.request(MSG.SCENE_GRAPH, {}, [MSG.SCENE_GRAPH]),
        session.request(MSG.LIST_APPS, {}, [MSG.APP_LIST]),
      ])
      const entities = sceneReply?.entities || []
      const knownAppNames = new Set((appsReply?.apps || []).map(a => a.name).filter(Boolean))
      const findings = lintWorld(entities, knownAppNames)
      const errorCount = findings.filter(f => f.severity === 'error').length
      const warnCount = findings.filter(f => f.severity === 'warn').length
      return { entityCount: entities.length, findingCount: findings.length, errorCount, warnCount, findings }
    })
  },
}

export default {
  name: 'spoint_editor',
  surfaces: 'pi',
  register({ pi }) {
    pi.tools.register(placeTool)
    pi.tools.register(terrainReseedTool)
    pi.tools.register(lintTool)
  },
}
