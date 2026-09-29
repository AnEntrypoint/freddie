/**
 * Explicit product usage events over OTLP/HTTP logs.
 *
 * This is the product-analytics channel, not the session channel.
 * [`freddie-session-telemetry-otel`](../../session/session-telemetry-otel/README.md)
 * captures session content behind a sharing mode and a redaction waterfall;
 * this package captures nothing. It opens one ordinary-event channel that
 * callers submit to by hand, so an event leaves only when some code selected
 * it, and what it carries is exactly what that caller passed.
 *
 * Upstream dsh builds this channel on a shared `otel` service's
 * `createEventReporter()`. Freddie has no such service — the one OTel
 * package in the tree composes the SDK itself — so this package composes the
 * same pipeline (`LoggerProvider` → `BatchLogRecordProcessor` →
 * OTLP/HTTP log exporter) and owns only what the analytics policy needs:
 * endpoint, identity, budgets, and a bounded shutdown wait. After
 * `logger.emit()`, batching, retry, queue bounds, and loss policy are SDK
 * behavior.
 *
 * @module @freddie/freddie-host-product-telemetry-otel
 */

import { createRequire } from 'node:module'
import { validateHeaderValue } from 'node:http'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'

const { version: instrumentationScopeVersion } = createRequire(import.meta.url)('../package.json')

/** Severity mapping from the caller's three-level vocabulary to OTel severity numbers. */
const SEVERITY = {
  info: { severityNumber: SeverityNumber.INFO, severityText: 'INFO' },
  warn: { severityNumber: SeverityNumber.WARN, severityText: 'WARN' },
  error: { severityNumber: SeverityNumber.ERROR, severityText: 'ERROR' },
}

/** Budgets matching the SDK's own defaults, so omitting the block changes nothing. */
const DEFAULT_BUDGETS = Object.freeze({
  maxExportBatchSize: 512,
  maxQueueSize: 2048,
  scheduledDelayMillis: 30_000,
  timeoutMillis: 15_000,
  exportTimeoutMillis: 20_000,
  shutdownTimeoutMillis: 21_000,
})

const MAX_NODE_TIMER_DELAY_MILLIS = 2_147_483_647

/**
 * Plugin configuration: collector routing, application identity, and bounded
 * in-memory batch settings. The schema checks only top-level types; every
 * bound is checked in the constructor so its error names the field.
 *
 * `endpoint` has no default on purpose: a default would make every deployment
 * that mounts this plugin report to whoever owns that default.
 */
export const Config = z.object({
  endpoint: z.string().required(),
  headers: z.any(),
  serviceName: z.string().required(),
  serviceVersion: z.string().required(),
  compression: z.union(['none', 'gzip']),
  maxExportBatchSize: z.number(),
  maxQueueSize: z.number(),
  scheduledDelayMillis: z.number(),
  timeoutMillis: z.number(),
  exportTimeoutMillis: z.number(),
  shutdownTimeoutMillis: z.number(),
})

/**
 * Reject anything but an HTTP(S) absolute URL.
 *
 * Checks run here rather than in the schema because the error has to name the
 * reason — a malformed URL and a `file:` endpoint fail differently and only
 * one of them is a typo.
 * @param {string} endpoint - configured endpoint, verbatim.
 * @returns {string} the endpoint, unchanged.
 */
function resolveEndpoint(endpoint) {
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error(`product-telemetry-otel: endpoint is not a valid URL: ${JSON.stringify(endpoint)}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`product-telemetry-otel: endpoint must be http(s), got ${parsed.protocol}`)
  }
  return endpoint
}

/**
 * Copy the caller's collector headers, refusing any that would corrupt the
 * request.
 *
 * These reach a transport the SDK builds, and a header value carrying a CR/LF
 * is request smuggling rather than a bad label — so each one faces Node's own
 * header validator at mount, where the misconfiguration still fails a
 * composition instead of an export nobody reads.
 * @param {Record<string, unknown>} [headers] - configured headers.
 * @returns {Record<string, string>} the accepted headers.
 */
function resolveHeaders(headers) {
  if (headers === undefined || headers === null) return {}
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('product-telemetry-otel: headers must be an object of string values')
  }
  const accepted = {}
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      throw new Error(`product-telemetry-otel: header ${JSON.stringify(name)} must be a string`)
    }
    try {
      validateHeaderValue(name, value)
    } catch (cause) {
      throw new Error(`product-telemetry-otel: header ${JSON.stringify(name)} is not a valid HTTP header value`, { cause })
    }
    accepted[name] = value
  }
  return accepted
}

/**
 * Apply {@link DEFAULT_BUDGETS} to the configured budgets and reject values
 * the SDK would silently mis-handle.
 *
 * The SDK accepts a non-positive batch size and then splices empty batches
 * without draining its queue, so `shutdown()` would hang forever with records
 * pending; it also accepts a delay above Node's timer ceiling, which Node
 * silently clamps to one millisecond and turns a batch interval into a hot
 * loop. Both fail the mount instead.
 * @param {object} config - resolved plugin config.
 * @returns {typeof DEFAULT_BUDGETS} the six budgets, every one a usable positive integer.
 */
function resolveBudgets(config) {
  const budgets = {}
  for (const [name, fallback] of Object.entries(DEFAULT_BUDGETS)) {
    const value = config[name] ?? fallback
    if (!Number.isInteger(value) || value < 1 || value > MAX_NODE_TIMER_DELAY_MILLIS) {
      throw new Error(`product-telemetry-otel: ${name} must be a positive integer no greater than ${MAX_NODE_TIMER_DELAY_MILLIS}, got ${String(value)}`)
    }
    budgets[name] = value
  }
  if (budgets.maxExportBatchSize > budgets.maxQueueSize) {
    throw new Error('product-telemetry-otel: maxExportBatchSize must not exceed maxQueueSize')
  }
  return budgets
}

/**
 * Product analytics sender. Mounting collects nothing: an event leaves only
 * when a caller submits one, and disposal drains whatever is queued under a
 * bounded wait.
 */
export class ProductTelemetry extends Service {
  static Config = Config

  provider
  logger
  shutdownTimeoutMillis

  constructor(ctx, config) {
    super(ctx, 'productTelemetry')
    const url = resolveEndpoint(config.endpoint)
    const headers = resolveHeaders(config.headers)
    const budgets = resolveBudgets(config)
    this.shutdownTimeoutMillis = budgets.shutdownTimeoutMillis
    const compressionWhenDeploymentNamesOne = config.compression === undefined ? {} : { compression: config.compression }
    this.provider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': config.serviceName,
        'service.version': config.serviceVersion,
      }),
      processors: [
        new BatchLogRecordProcessor({
          maxExportBatchSize: budgets.maxExportBatchSize,
          maxQueueSize: budgets.maxQueueSize,
          scheduledDelayMillis: budgets.scheduledDelayMillis,
          exportTimeoutMillis: budgets.exportTimeoutMillis,
          exporter: new OTLPLogExporter({
            url,
            headers,
            timeoutMillis: budgets.timeoutMillis,
            ...compressionWhenDeploymentNamesOne,
          }),
        }),
      ],
    })
    this.logger = this.provider.getLogger('@freddie/freddie-host-product-telemetry-otel', instrumentationScopeVersion)
    ctx.effect(() => async () => { await this.shutdown() }, 'product-telemetry-otel: drain')
  }

  /**
   * Enqueue one selected product event without waiting for network delivery.
   *
   * Queue admission is not a collector acknowledgement and not warehouse
   * ingestion: the queue is memory-only, and a full queue, an unreachable
   * collector, or process exit loses records. The event name travels as the
   * `event.name` attribute rather than in the body so a receiver can group by
   * it while the body stays a readable one-line summary.
   * @param {import('./types.js').ProductTelemetryRecord} record - caller-owned event.
   * @returns {void}
   */
  emit(record) {
    const time = record.time ?? Date.now()
    this.logger.emit({
      timestamp: time,
      observedTimestamp: Date.now(),
      ...SEVERITY[record.severity ?? 'info'],
      body: record.body,
      attributes: { 'event.name': record.name, ...record.attributes },
    })
  }

  /**
   * Ask the SDK to drain and quiesce, abandoning the wait at the configured
   * deadline.
   *
   * Never rejects and never throws: teardown of an analytics channel must not
   * fail the disposal of the composition that mounted it. OTel's processor
   * export timeout wraps `exportCompleted` only, while shutdown first awaits
   * `exporter.forceFlush()`, which can stay pending when the transport never
   * obtains a socket — hence a bound this package owns. The deadline cannot
   * cancel SDK transport, so records still pending when it fires may be lost.
   * @returns {Promise<void>} resolves when the pipeline quiesces or the deadline fires.
   */
  async shutdown() {
    let timer
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        this.ctx.logger.warn(`product-telemetry-otel: shutdown exceeded ${this.shutdownTimeoutMillis}ms; pending events may be lost`)
        resolve()
      }, this.shutdownTimeoutMillis)
    })
    try {
      await Promise.race([
        this.provider.shutdown().catch((cause) => {
          this.ctx.logger.warn(new Error('product-telemetry-otel: provider shutdown failed', { cause }))
        }),
        deadline,
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}

export default ProductTelemetry
