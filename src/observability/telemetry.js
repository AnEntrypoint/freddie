/**
 * Telemetry — lightweight event tracking for observability.
 * Events are written to JSONL and optionally flushed to a remote endpoint.
 * All tracking is opt-in via config (telemetry.enabled, default false).
 * Browser-safe: in-memory buffer when filesystem unavailable.
 */

export class Telemetry {
  constructor({ enabled = false, endpoint = null, freddieHome = null } = {}) {
    this._enabled = enabled;
    this._endpoint = endpoint;
    this._buffer = []; // in-memory buffer
    this._sessionId = null;
    this._turnId = null;
    this._freddieHome = freddieHome;
  }

  _track(event, data = {}) {
    if (!this._enabled) return;
    const record = {
      event,
      session_id: this._sessionId,
      turn_id: this._turnId,
      timestamp: new Date().toISOString(),
      ...data,
    };
    this._buffer.push(record);
    this._flushIfNeeded();
  }

  _flushIfNeeded() {
    if (this._buffer.length >= 50) this._flush();
  }

  async _flush() {
    if (!this._buffer.length) return;
    const batch = this._buffer.splice(0);
    const jsonl = batch.map(r => JSON.stringify(r)).join('\n') + '\n';
    // Write to JSONL file if available
    if (this._freddieHome) {
      try {
        const { appendFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const file = join(this._freddieHome, 'telemetry.jsonl');
        appendFileSync(file, jsonl);
      } catch { /* filesystem unavailable */ }
    }
    // Send to remote endpoint if configured
    if (this._endpoint) {
      try {
        await fetch(this._endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
      } catch { /* endpoint unreachable */ }
    }
  }

  // Session lifecycle
  setSession(sessionId) { this._sessionId = sessionId; }
  setTurn(turnId) { this._turnId = turnId; }

  // Event methods
  turnStarted(data) { this._track('turn_started', data); }
  turnEnded(data) { this._track('turn_ended', data); }
  turnInterrupted(data) { this._track('turn_interrupted', data); }
  toolCall(data) { this._track('tool_call', data); }
  toolCallRepeat(data) { this._track('tool_call_repeat', data); }
  toolApproved(data) { this._track('tool_approved', data); }
  toolRejected(data) { this._track('tool_rejected', data); }
  apiError(data) { this._track('api_error', data); }
  compactionFinished(data) { this._track('compaction_finished', data); }
  compactionFailed(data) { this._track('compaction_failed', data); }
  planSubmitted(data) { this._track('plan_submitted', data); }
  planResolved(data) { this._track('plan_resolved', data); }
  yoloToggled(data) { this._track('yolo_toggle', data); }
  afkToggled(data) { this._track('afk_toggle', data); }
  skillInvoked(data) { this._track('skill_invoked', data); }
  subagentCreated(data) { this._track('subagent_created', data); }
  hookTriggered(data) { this._track('hook_triggered', data); }
  mcpConnected(data) { this._track('mcp_connected', data); }
  mcpFailed(data) { this._track('mcp_failed', data); }
  turnForceStopped(data) { this._track('turn_force_stopped', data); }
  goalCreated(data) { this._track('goal_created', data); }
  goalCompleted(data) { this._track('goal_completed', data); }
  goalBlocked(data) { this._track('goal_blocked', data); }

  async flush() { await this._flush(); }
  reset() { this._buffer = []; this._sessionId = null; this._turnId = null; }
}

export const telemetry = new Telemetry();