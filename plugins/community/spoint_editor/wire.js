// Minimal Node WebSocket client for spoint's real editor wire protocol.
//
// Protocol reverse-engineered from the actual spoint source (C:/dev/spoint), not invented:
//   - Wire framing: msgpackr-encoded {type, payload} envelopes over a plain `ws` WebSocket
//     at ws://<host>:<port>/ws (src/transport/WebSocketTransport.js, src/connection/
//     ConnectionManager.js `unpack(data)` on 'message', `pack({type,payload})` implicitly via
//     connections.send -> ConnectionManager -- see src/protocol/msgpack.js).
//   - Both sides share a fixed msgpackr `structures` table (src/protocol/msgpack.js
//     WIRE_STRUCTURES) so record-shaped payloads decode correctly without runtime
//     negotiation; the first entry, ['type','payload'], is the one every message in this
//     client uses. Reproduced verbatim here (not re-derived) so decoding of the server's own
//     replies -- which DO use msgpackr's compact record extension keyed against this exact
//     table -- succeeds. A plain map-encoded {type,payload} object (what a naive msgpack
//     encode would produce without the structures table) still decodes fine either way since
//     msgpackr's decoder auto-detects record vs map wire shapes; matching the table is what
//     keeps outbound frames small and, more importantly, is required to decode inbound
//     server-coalesced frames whose per-message envelopes use the same shared record id.
//   - Server also frame-coalesces multiple queued messages into one socket write behind a
//     0xFF sentinel byte + repeated [uint32 LE length][msgpack bytes] records
//     (src/connection/ConnectionManager.js frameCoalesced/COALESCE_SENTINEL) -- a client must
//     decode that shape too, since any server->client burst (e.g. HANDSHAKE_ACK + WORLD_DEF +
//     APP_MODULE + SNAPSHOT + SCENE_GRAPH sent in the same tick on connect) can arrive
//     coalesced into a single WS frame.
//   - MSG numeric ids from src/protocol/MessageTypes.js (reproduced verbatim below -- this
//     file is the single source of truth on the spoint side; duplicating the needed subset
//     here avoids a cross-repo import spoint does not publish as a package).
//   - Editor-gated messages (PLACE_MODEL, PLACE_APP, TERRAIN_RESEED, SCENE_GRAPH request, ...)
//     are rejected server-side unless the connecting client's `isEditor` flag is set
//     (src/sdk/ServerHandlers.js `_onClientMessage`, editorHandlers.HANDLED_TYPES.has(msg.type)
//     branch). That flag is set either automatically (EDITOR_TOKEN unset on the server = open
//     dev default, src/sdk/ServerHandlers.js:42) or by sending AUTH_EDITOR (0x9d) with the
//     correct token and awaiting AUTH_EDITOR_ACK (0x9e) with ok:true
//     (src/sdk/ServerHandlers.js:196-204, constant-time compared via src/sdk/authCompare.js).

import { WebSocket } from 'ws'
import { Packr } from 'msgpackr'

// Verbatim copy of src/protocol/msgpack.js WIRE_STRUCTURES[0] (the only structure this
// client's traffic ever uses -- the second table entry, the 128Hz SNAPSHOT record shape, is
// irrelevant to editor tooling and omitted; msgpackr's structures matching is positional by
// index within an object's own field set, so omitting an unused later entry does not affect
// decoding of the first).
const WIRE_STRUCTURES = [
  ['type', 'payload'],
]

function makePackr() {
  return new Packr({
    useFloat32: 3,
    bundleStrings: true,
    structures: WIRE_STRUCTURES.map(s => s.slice()),
    saveStructures: false,
    maxSharedStructures: WIRE_STRUCTURES.length,
  })
}

// Verbatim subset of src/protocol/MessageTypes.js MSG needed by this plugin's tools.
export const MSG = {
  HANDSHAKE_ACK: 0x02,
  WORLD_DEF: 0x71,
  APP_MODULE: 0x72,
  SNAPSHOT: 0x10,

  EDITOR_UPDATE: 0x80,
  EDITOR_SELECT: 0x81,
  PLACE_MODEL: 0x82,
  PLACE_APP: 0x83,
  LIST_APPS: 0x84,
  APP_LIST: 0x85,
  SCENE_GRAPH: 0x89,
  EDITOR_ERROR: 0x9f,

  TERRAIN_RESEED: 0x9b,
  TERRAIN_CONFIG: 0x9c,

  AUTH_EDITOR: 0x9d,
  AUTH_EDITOR_ACK: 0x9e,
}

const nameMap = new Map(Object.entries(MSG).map(([k, v]) => [v, k]))
export function msgName(id) { return nameMap.get(id) || `UNKNOWN(0x${id.toString(16)})` }

const COALESCE_SENTINEL = 0xff
const LEN_PREFIX_BYTES = 4

// Decodes one raw WS frame payload (Buffer) into an array of {type,payload} envelopes --
// either exactly one (the common case) or several if the server coalesced them
// (ConnectionManager.js frameCoalesced), mirroring the real decode contract a spoint client
// must honor.
function decodeFrame(packr, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (buf.length === 0) return []
  if (buf[0] === COALESCE_SENTINEL) {
    const out = []
    let off = 1
    while (off < buf.length) {
      const len = buf.readUInt32LE(off); off += LEN_PREFIX_BYTES
      const slice = buf.subarray(off, off + len); off += len
      out.push(packr.unpack(slice))
    }
    return out
  }
  return [packr.unpack(buf)]
}

// Opens one real WebSocket connection to a spoint server's editor endpoint, authenticates via
// AUTH_EDITOR if a token is configured, and exposes a small request/response + fire-and-wait
// primitive keyed by expected reply MSG type. One connection = one logical editor session;
// callers (the tool handlers) open, do one action, close -- matching the short-lived
// tool-call shape freddie's dispatchTool imposes (no long-lived session state across calls).
export function connectEditor({ host = '127.0.0.1', port = 3000, token, timeoutMs = 8000 } = {}) {
  const packr = makePackr()
  const url = `ws://${host}:${port}/ws`
  const ws = new WebSocket(url)
  const listeners = new Set()

  const ready = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`spoint_editor: connect timeout after ${timeoutMs}ms to ${url}`)), timeoutMs)
    ws.once('open', () => { clearTimeout(to); resolve() })
    ws.once('error', (e) => { clearTimeout(to); reject(new Error(`spoint_editor: WebSocket error connecting to ${url}: ${e.message}`)) })
  })

  ws.on('message', (data) => {
    let envelopes
    try { envelopes = decodeFrame(packr, data) } catch (e) { return } // malformed frame from a non-spoint peer -- drop, never throw into 'message' listeners
    for (const env of envelopes) {
      if (!env || typeof env.type !== 'number') continue
      for (const fn of listeners) fn(env.type, env.payload)
    }
  })

  function send(type, payload) {
    if (ws.readyState !== WebSocket.OPEN) throw new Error(`spoint_editor: socket not open (readyState=${ws.readyState})`)
    ws.send(packr.pack({ type, payload: payload ?? null }))
  }

  // Sends `type`/`payload` and resolves with the FIRST message matching any id in
  // `expectTypes` (array) -- editor handlers can ack via more than one possible type
  // (e.g. PLACE_APP -> EDITOR_SELECT on success, but a malformed request in some handlers
  // replies EDITOR_ERROR instead), so callers name every acceptable outcome up front rather
  // than racing a fixed single type against a silent hang.
  function request(type, payload, expectTypes, { timeoutMs: reqTimeout = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const wanted = new Set(expectTypes)
      const to = setTimeout(() => { listeners.delete(onMsg); reject(new Error(`spoint_editor: timed out waiting for ${[...wanted].map(msgName).join('|')} after sending ${msgName(type)}`)) }, reqTimeout)
      function onMsg(rt, payload2) {
        if (!wanted.has(rt)) return
        clearTimeout(to); listeners.delete(onMsg)
        resolve({ type: rt, payload: payload2 })
      }
      listeners.add(onMsg)
      try { send(type, payload) } catch (e) { clearTimeout(to); listeners.delete(onMsg); reject(e) }
    })
  }

  async function authIfNeeded() {
    if (!token) return { skipped: true }
    const { payload } = await request(MSG.AUTH_EDITOR, { token }, [MSG.AUTH_EDITOR_ACK])
    if (!payload?.ok) throw new Error('spoint_editor: AUTH_EDITOR rejected -- wrong or missing EDITOR_TOKEN')
    return { skipped: false, ok: true }
  }

  function close() { try { ws.close() } catch (e) {} }

  return { ready, send, request, authIfNeeded, close, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn) } }
}
