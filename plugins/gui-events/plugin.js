/**
 * gui-events — Real-time WebSocket events for session lifecycle.
 *
 * WebSocket endpoint: /api/events
 *
 * Event types (matching pi-web):
 *   session.created  — new session created
 *   session.start    — agent turn started
 *   message.append   — new message in transcript
 *   assistant.delta  — streaming assistant text (for in-progress turns)
 *   tool.start       — tool execution started
 *   tool.end         — tool execution completed
 *   session.end      — agent turn completed
 *   session.error    — session error
 *   status.update    — session status change
 *
 * Clients can filter by session ID:
 *   send: {"type":"subscribe","sessionId":"..."}
 *   send: {"type":"unsubscribe","sessionId":"..."}
 *
 * Heartbeat: every 30s to keep connections alive.
 */

import { on, emit } from './event-bus.js';
import { logger } from '../../src/observability/log.js';

const log = logger('gui_events');
const HEARTBEAT_MS = 30_000;

export default {
  name: 'gui-events',
  surfaces: 'gui',
  register({ gui }) {
    // Track connected clients: ws -> Set<sessionId | '*'> (empty or '*' means all)
    const clients = new Map();

    gui.wsRoute('/api/events', (ws, req) => {
      const subs = new Set();
      clients.set(ws, subs);

      log.info('client connected', { remote: req?.socket?.remoteAddress });

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === 1) {
          try { ws.ping(); } catch { /* ignore */ }
        }
      }, HEARTBEAT_MS);

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'subscribe' && msg.sessionId) {
          subs.add(msg.sessionId);
        } else if (msg.type === 'unsubscribe' && msg.sessionId) {
          subs.delete(msg.sessionId);
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(ws);
        log.info('client disconnected');
      });

      ws.on('error', () => {
        clearInterval(heartbeat);
        clients.delete(ws);
      });
    });

    // Broadcast an event to all connected clients whose subscriptions match.
    function broadcast(event, data) {
      const payload = JSON.stringify({ event, data, ts: new Date().toISOString() });
      const sessionId = data?.sessionId;
      for (const [ws, subs] of clients) {
        if (ws.readyState !== 1) continue;
        // Match: wildcard (empty set or contains '*') or explicit sessionId match
        if (subs.size === 0 || subs.has('*') || (sessionId && subs.has(sessionId))) {
          try { ws.send(payload); } catch { /* ignore send errors */ }
        }
      }
    }

    // Listen to the shared event bus
    const unsubs = [
      on('session.created', (data) => broadcast('session.created', data)),
      on('session.start', (data) => broadcast('session.start', data)),
      on('message.append', (data) => broadcast('message.append', data)),
      on('assistant.delta', (data) => broadcast('assistant.delta', data)),
      on('tool.start', (data) => broadcast('tool.start', data)),
      on('tool.end', (data) => broadcast('tool.end', data)),
      on('session.end', (data) => broadcast('session.end', data)),
      on('session.error', (data) => broadcast('session.error', data)),
      on('status.update', (data) => broadcast('status.update', data)),
    ];

    // Cleanup is handled naturally — the event bus is process-lifetime, and
    // the plugin is loaded once at boot. The unsubs are kept alive for the
    // lifetime of the process. If we ever support hot-reload, these would
    // need to be unregistered.
    log.info('registered /api/events WebSocket endpoint');
  },
};