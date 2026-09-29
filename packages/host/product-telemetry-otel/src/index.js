import { createRequire } from 'node:module'
import { validateHeaderValue } from 'node:http'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'

const { version: instrumentationScopeVersion } = createRequire(import.meta.url)('../package.json')

const SEVERITY = {
  info: { severityNumber: SeverityNumber.INFO, severityText: 'INFO' },
  warn: { severityNumber: SeverityNumber.WARN, severityText: 'WARN' },
  error: { severityNumber: SeverityNumber.ERROR, severityText: 'ERROR' },
}

const DEFAULT_BUDGETS = Object.freeze({
  maxExportBatchSize: 512,
  maxQueueSize: 2048,
  scheduledDelayMillis: 30_000,
  timeoutMillis: 15_000,
  exportTimeoutMillis: 20_000,
  shutdownTimeoutMillis: 21_000,
})

const MAX_NODE_TIMER_DELAY_MILLIS = 2_147_483_647

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
