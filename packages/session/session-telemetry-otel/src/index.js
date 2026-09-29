/**
 * OpenTelemetry Service Provider for the Freddie telemetry capability.
 *
 * Composes the OTel JS SDK as-is — a `LoggerProvider` with a
 * `BatchLogRecordProcessor` and an OTLP/HTTP log exporter — and maps each
 * record handed over by the capture coordinator onto `logger.emit()`. After that call,
 * batching, retry, queueing, and loss policy use the SDK's documented behavior, configured
 * verbatim through the `exporter`/`processor` passthroughs. This package owns
 * capture mode and an outer shutdown deadline: the SDK's export timeout does
 * not bound its preceding `forceFlush()` wait.
 *
 * @module @freddie/freddie-session-telemetry-otel
 */

import { createRequire } from 'node:module'
import z from '@freddie/schemastery'
import {
  SessionTelemetryBackend,
  SessionTelemetryCoordinator,
} from '@freddie/freddie-session-telemetry'
import { APP_IDENTITY } from '@freddie/freddie-llm'
import { getOrCreateAnonymousUserId } from '@freddie/freddie-anonymous-user-id'
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'

const { version: instrumentationScopeVersion } = createRequire(import.meta.url)('../package.json')

/** OTel semantic-convention Resource attribute for the anonymous user. */
const SEMCONV_USER_ID = 'user.id'

/** Session-sharing policy selected by {@link Config.mode}. */
export const SessionTelemetryMode = Object.freeze({
  FULL: 'FULL',
  FEEDBACK_ONLY: 'FEEDBACK_ONLY',
  DISABLED: 'DISABLED',
})

/** Default session-sharing policy for schema and direct construction. */
export const DEFAULT_TELEMETRY_MODE = SessionTelemetryMode.DISABLED

const DISABLED_FEEDBACK_WARNING = 'session telemetry is DISABLED; nothing will be shared and this feedback remains local'
const ENDPOINT_MISSING_WARNING = requestedMode => `session telemetry mode ${requestedMode} requested but exporter.url is not set; telemetry stays DISABLED and nothing is exported (there is no default collector)`
const NON_CANONICAL_FEEDBACK_WARNING = 'session telemetry ignored a feedback event absent from the canonical session log'
const DROP_RECORD = () => {}

/** Resolve the default and reject unknown runtime values before transport setup. */
function resolveMode(mode) {
  const resolved = mode ?? DEFAULT_TELEMETRY_MODE
  switch (resolved) {
    case SessionTelemetryMode.FULL:
    case SessionTelemetryMode.FEEDBACK_ONLY:
    case SessionTelemetryMode.DISABLED:
      return resolved
    default:
      return assertNever(resolved)
  }
}

/** Fail closed when direct construction bypasses the runtime config schema. */
function assertNever(value) {
  throw new Error(`session-telemetry-otel: unsupported mode ${JSON.stringify(value)}`)
}

/** Map the serialized mode onto the seam's backend-independent sharing vocabulary. */
function sharingStatusFor(mode) {
  switch (mode) {
    case SessionTelemetryMode.FULL: return 'full'
    case SessionTelemetryMode.FEEDBACK_ONLY: return 'feedback-only'
    case SessionTelemetryMode.DISABLED: return 'disabled'
    /* v8 ignore next 2 -- resolveMode already rejected unknown values before this switch; the closed enum cannot reach the default. */
    default: return assertNever(mode)
  }
}

/**
 * Plugin configuration: one sharing policy, two verbatim SDK option objects,
 * and one FREDDIE-owned shutdown bound. Uploading modes validate their endpoint
 * and shutdown deadline at plugin load; `DISABLED` reads neither. An uploading
 * mode with no `exporter.url` runs as `DISABLED` and logs why: the package has
 * no default collector, so nothing is exported until an operator names one.
 * @typedef {object} SessionTelemetryOtelConfig
 * @property {string} [mode] - one of {@link SessionTelemetryMode}'s values; defaults to {@link DEFAULT_TELEMETRY_MODE}.
 * @property {unknown} [exporter] - verbatim OpenTelemetry OTLP log-exporter SDK options.
 * @property {unknown} [processor] - verbatim OpenTelemetry batch log-processor SDK options.
 * @property {number} [shutdownTimeoutMillis] - outer allowance for the SDK's shutdown sequence.
 */

/**
 * Schemastery validator for {@link Config}; cordis runs it before the plugin
 * starts. It checks only the top-level fields; value checks live in the constructor
 * so their errors name the fields. Both SDK option objects pass through unchanged:
 * the SDK defines and validates their fields. Re-declaring them here would
 * silently drop every field this plugin did not repeat.
 */
export const Config = z.object({
  mode: z.union(Object.values(SessionTelemetryMode)).default(DEFAULT_TELEMETRY_MODE),
  exporter: z.any(),
  processor: z.any(),
  shutdownTimeoutMillis: z.number(),
})

/** Default outer allowance for the SDK's complete shutdown sequence. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MILLIS = 3_000

const NODE_TIMER_DELAY_CEILING_MILLIS = 2_147_483_647

/**
 * Refuse a batch size the SDK accepts but cannot drain at shutdown.
 * @param {unknown} batchSize - `processor.maxExportBatchSize`, when configured.
 * @throws {Error} when the size is defined and not a positive integer.
 */
function assertDrainableBatchSize(batchSize) {
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1)) {
    throw new Error(`session-telemetry-otel: processor.maxExportBatchSize must be a positive integer, got ${String(batchSize)}`)
  }
}

/** Severity mapping from the Service Definition's three-level vocabulary to OTel severity numbers. */
const SEVERITY = {
  info: { severityNumber: SeverityNumber.INFO, severityText: 'INFO' },
  warn: { severityNumber: SeverityNumber.WARN, severityText: 'WARN' },
  error: { severityNumber: SeverityNumber.ERROR, severityText: 'ERROR' },
}

/**
 * The backend plugin — the only entry a deployment loads. It always registers
 * the `telemetry` service (duplicate load throws). Uploading modes wire the SDK
 * pipeline and compose {@link SessionTelemetryCoordinator}; `DISABLED` constructs no
 * SDK state and listens only to warn when recorded feedback stays local.
 */
export class OpenTelemetrySessionBackend extends SessionTelemetryBackend {
  static inject = ['sessions']
  static Config = Config

  directEmit
  provider
  shutdownTimeoutMillis
  sharing

  constructor(ctx, config) {
    const requestedMode = resolveMode(config.mode)
    const url = config.exporter?.url
    const endpointMissing = url === undefined || url.length === 0
    const mode = requestedMode !== SessionTelemetryMode.DISABLED && endpointMissing
      ? SessionTelemetryMode.DISABLED
      : requestedMode
    super(ctx)
    if (mode !== requestedMode) ctx.logger.warn(ENDPOINT_MISSING_WARNING(requestedMode))
    this.sharing = sharingStatusFor(mode)
    if (mode === SessionTelemetryMode.DISABLED) {
      this.directEmit = DROP_RECORD
      this.provider = undefined
      this.shutdownTimeoutMillis = DEFAULT_SHUTDOWN_TIMEOUT_MILLIS
      ctx.on('session/event', (_session, event) => {
        if (event.type === 'feedback/record') ctx.logger.warn(DISABLED_FEEDBACK_WARNING)
      })
      return
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`session-telemetry-otel: exporter.url is not a valid URL: ${JSON.stringify(url)}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`session-telemetry-otel: exporter.url must be http(s), got ${parsed.protocol}`)
    }
    assertDrainableBatchSize(config.processor?.maxExportBatchSize)
    const shutdownTimeoutMillis = config.shutdownTimeoutMillis ?? DEFAULT_SHUTDOWN_TIMEOUT_MILLIS
    if (!Number.isFinite(shutdownTimeoutMillis) || shutdownTimeoutMillis <= 0 || shutdownTimeoutMillis > NODE_TIMER_DELAY_CEILING_MILLIS) {
      throw new Error(`session-telemetry-otel: shutdownTimeoutMillis must be a positive finite number no greater than ${NODE_TIMER_DELAY_CEILING_MILLIS}, got ${String(shutdownTimeoutMillis)}`)
    }
    this.shutdownTimeoutMillis = shutdownTimeoutMillis
    this.provider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': APP_IDENTITY.product,
        'service.version': APP_IDENTITY.version,
        [SEMCONV_USER_ID]: getOrCreateAnonymousUserId(),
      }),
      processors: [
        new BatchLogRecordProcessor({
          ...config.processor,
          exporter: new OTLPLogExporter(config.exporter),
        }),
      ],
    })
    const ledger = this.provider.getLogger('@freddie/freddie-session-telemetry-otel', instrumentationScopeVersion)
    const ops = this.provider.getLogger('@freddie/freddie-session-telemetry-otel/ops', instrumentationScopeVersion)
    const enqueue = (record) => {
      const logger = record.channel === 'ops' ? ops : ledger
      logger.emit({
        timestamp: record.time,
        observedTimestamp: record.time,
        ...SEVERITY[record.severity],
        body: record.body,
        attributes: record.attributes,
      })
    }
    const backend = {
      emit: enqueue,
      shutdown: () => this.shutdown(),
    }
    if (mode === SessionTelemetryMode.FULL) {
      this.directEmit = enqueue
      new SessionTelemetryCoordinator(ctx, backend, 'live')
      return
    }
    this.directEmit = DROP_RECORD
    const coordinator = new SessionTelemetryCoordinator(ctx, backend, 'on-demand')
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'feedback/record') return
      const isCommittedRecord = session.events[event.seq] === event
      if (!isCommittedRecord) {
        ctx.logger.warn(NON_CANONICAL_FEEDBACK_WARNING)
        return
      }
      coordinator.captureSession(session, event.seq)
    })
  }

  /**
   * Hand a direct service record to the SDK only in `FULL`. Direct calls are
   * no-ops in `FEEDBACK_ONLY` and `DISABLED`; feedback replay uses a private
   * backend capability created only for the canonical feedback listener.
   * @param record - the logical record offered directly to the service.
   */
  emit(record) {
    this.directEmit(record)
  }

  /**
   * Ask the SDK to drain and quiesce, but reject after the backend-owned
   * deadline. OTel's processor export timeout wraps `exportCompleted` only;
   * shutdown awaits `exporter.forceFlush()` first, which can remain pending
   * when the transport never obtains a socket. The provider promise remains
   * observed after the deadline so a later rejection cannot become unhandled.
   * `DISABLED` has no provider and resolves immediately.
   * @returns resolves when the SDK pipeline quiesces or is disabled, or rejects at the configured deadline.
   */
  async shutdown() {
    if (this.provider === undefined) return
    const providerShutdown = this.provider.shutdown()
    let timer
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`session-telemetry-otel: provider shutdown exceeded ${this.shutdownTimeoutMillis}ms`))
      }, this.shutdownTimeoutMillis)
    })
    try {
      await Promise.race([providerShutdown, deadline])
    } finally {
      /* v8 ignore else -- the Promise executor assigns timer synchronously before this race starts. */
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}

export default OpenTelemetrySessionBackend
