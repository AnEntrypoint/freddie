import z from '@freddie/schemastery'
import { HttpFetchProvider } from './provider.js'

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647

export {
  LOCAL_FETCH_PROVIDER_ID,
  HttpFetchProvider,
} from './provider.js'

export const DEFAULT_USER_AGENT = 'freddie/0.0.1 (+https://github.com/lanmower/freddie)'

export const name = 'web-fetch-http'

export const inject = ['web']

export const Config = z.object({
  maxUrlLength: z.number().default(2048),
  maxResponseBytes: z.number().default(5_000_000),
  maxBodyChars: z.number().default(100_000),
  timeoutMs: z.number().default(30_000),
  maxRedirects: z.number().default(5),
  userAgent: z.string().default(DEFAULT_USER_AGENT),
})

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`web-fetch-http: ${name} must be a positive finite number`)
  }
}

function assertTimeoutMs(value) {
  assertPositiveFinite('timeoutMs', value)
  if (value > MAX_NODE_TIMER_DELAY_MS) {
    throw new Error(`web-fetch-http: timeoutMs must be no greater than ${MAX_NODE_TIMER_DELAY_MS}`)
  }
}

function assertNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`web-fetch-http: ${name} must be a non-negative integer`)
  }
}

export function apply(ctx, config) {
  const resolved = config
  assertPositiveFinite('maxUrlLength', resolved.maxUrlLength)
  assertPositiveFinite('maxResponseBytes', resolved.maxResponseBytes)
  assertPositiveFinite('maxBodyChars', resolved.maxBodyChars)
  assertTimeoutMs(resolved.timeoutMs)
  assertNonNegativeInteger('maxRedirects', resolved.maxRedirects)
  const limits = {
    maxUrlLength: resolved.maxUrlLength,
    maxResponseBytes: resolved.maxResponseBytes,
    maxBodyChars: resolved.maxBodyChars,
    timeoutMs: resolved.timeoutMs,
    maxRedirects: resolved.maxRedirects,
    userAgent: resolved.userAgent,
  }
  ctx.web.registerFetchProvider(new HttpFetchProvider(limits))
}
