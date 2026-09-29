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

const SEMCONV_USER_ID = 'user.id'

export const SessionTelemetryMode = Object.freeze({
  FULL: 'FULL',
  FEEDBACK_ONLY: 'FEEDBACK_ONLY',
  DISABLED: 'DISABLED',
})

export const DEFAULT_TELEMETRY_MODE = SessionTelemetryMode.DISABLED

const DISABLED_FEEDBACK_WARNING = 'session telemetry is DISABLED; nothing will be shared and this feedback remains local'
const ENDPOINT_MISSING_WARNING = requestedMode => `session telemetry mode ${requestedMode} requested but exporter.url is not set; telemetry stays DISABLED and nothing is exported (there is no default collector)`
const NON_CANONICAL_FEEDBACK_WARNING = 'session telemetry ignored a feedback event absent from the canonical session log'
const DROP_RECORD = () => {}

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

function assertNever(value) {
  throw new Error(`session-telemetry-otel: unsupported mode ${JSON.stringify(value)}`)
}

function sharingStatusFor(mode) {
  switch (mode) {
    case SessionTelemetryMode.FULL: return 'full'
    case SessionTelemetryMode.FEEDBACK_ONLY: return 'feedback-only'
    case SessionTelemetryMode.DISABLED: return 'disabled'
    /* v8 ignore next 2 */
    default: return assertNever(mode)
  }
}

export const Config = z.object({
  mode: z.union(Object.values(SessionTelemetryMode)).default(DEFAULT_TELEMETRY_MODE),
  exporter: z.any(),
  processor: z.any(),
  shutdownTimeoutMillis: z.number(),
})

export const DEFAULT_SHUTDOWN_TIMEOUT_MILLIS = 3_000

const NODE_TIMER_DELAY_CEILING_MILLIS = 2_147_483_647

function assertDrainableBatchSize(batchSize) {
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1)) {
    throw new Error(`session-telemetry-otel: processor.maxExportBatchSize must be a positive integer, got ${String(batchSize)}`)
  }
}

const SEVERITY = {
  info: { severityNumber: SeverityNumber.INFO, severityText: 'INFO' },
  warn: { severityNumber: SeverityNumber.WARN, severityText: 'WARN' },
  error: { severityNumber: SeverityNumber.ERROR, severityText: 'ERROR' },
}

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

  emit(record) {
    this.directEmit(record)
  }

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
      /* v8 ignore else */
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}

export default OpenTelemetrySessionBackend
