/**
 * SessionTelemetryBackend Service Definition for the Freddie.
 *
 * This package owns the CAPTURE side of session-event reporting — which records
 * exist (the chunk projection), what they carry (the logical record), when
 * they are captured (adoption, the per-append firehose, lifecycle
 * forwarding), live versus on-demand canonical-log capture, and the HMR
 * cursor. Everything downstream of
 * {@link SessionTelemetryBackend.emit} — batching, retry, queueing, and loss policy — is the
 * reporting SDK's territory and is deliberately not modelled here. The
 * design and its trade-offs are pinned in
 * .agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md.
 *
 * @module @freddie/freddie-session-telemetry
 */

import { Service } from '@freddie/cordis'

/**
 * Loadable form of the backend contract: one implementation per context —
 * the cordis `Service` registration under the `telemetry` key throws on a
 * duplicate, cordis' standard behavior. A backend composes a
 * SessionTelemetryCoordinator in its constructor to install the capture side.
 *
 * Concrete backends must implement `sharing` (deployment-selected
 * session-sharing policy: 'full' | 'feedback-only' | 'disabled'), `emit(record)`
 * (hand one record to the backend's pipeline, MUST be a non-blocking enqueue),
 * and `shutdown()` (flush and reach quiescence, returns a Promise). `flush()`
 * is optional.
 */
export class SessionTelemetryBackend extends Service {
  constructor(ctx) {
    super(ctx, 'sessionTelemetry')
  }
}

export { SessionTelemetryCoordinator } from './coordinator.js'
