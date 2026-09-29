import { DEFAULT_PORT, INSPECTOR_HOST, LOOPBACK_HOSTS } from './shared.js'

export function assertLoopback(host, label = 'inspector') {
  if (typeof host !== 'string' || !LOOPBACK_HOSTS.includes(host)) {
    throw new Error(
      `${label}: refusing to bind ${JSON.stringify(host)} — the CDP target executes arbitrary Host code, `
      + `so only ${LOOPBACK_HOSTS.join(', ')} are accepted and there is no field that widens this`,
    )
  }
  return host
}

export function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false
  if (address === 'localhost' || address === '::1') return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)
}

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024
export const DEFAULT_MAX_JOURNAL_BYTES = 64 * 1024 * 1024
export const DEFAULT_MAX_RETAINED_REQUESTS = 2_000
export const DEFAULT_MAX_QUEUED_RECORDS = 2_048
export const DEFAULT_MAX_QUEUED_BYTES = 8 * 1024 * 1024
export const DEFAULT_MAX_FRAME_BYTES = 128 * 1024
export const DEFAULT_MAX_CORDIS_NODES = 2_048
export const DEFAULT_STARTUP_TIMEOUT_MS = 10_000
export const DEFAULT_STOP_TIMEOUT_MS = 5_000
export const DEFAULT_CORDIS_INTERVAL_MS = 1_000
export const MIN_CORDIS_INTERVAL_MS = 50
export const MAX_CORDIS_INTERVAL_MS = 600_000

function natural(value, name, { zero = false, min = zero ? 0 : 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`inspector: ${name} must be a safe integer from ${min} to ${max}`)
  }
  return value
}

export function resolveInspectorOptions(options = {}) {
  const spec = {
    host: assertLoopback(options.host ?? INSPECTOR_HOST),
    port: natural(options.port ?? DEFAULT_PORT, 'port', { zero: true, max: 65_535 }),
    captureFetch: options.captureFetch ?? true,
    captureBodies: options.captureBodies ?? false,
    maxBodyBytes: natural(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, 'maxBodyBytes'),
    maxJournalBytes: natural(options.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES, 'maxJournalBytes'),
    maxRetainedRequests: natural(options.maxRetainedRequests ?? DEFAULT_MAX_RETAINED_REQUESTS, 'maxRetainedRequests'),
    maxQueuedRecords: natural(options.maxQueuedRecords ?? DEFAULT_MAX_QUEUED_RECORDS, 'maxQueuedRecords'),
    maxQueuedBytes: natural(options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES, 'maxQueuedBytes'),
    maxFrameBytes: natural(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, 'maxFrameBytes'),
    maxCordisNodes: natural(options.maxCordisNodes ?? DEFAULT_MAX_CORDIS_NODES, 'maxCordisNodes'),
    cordisIntervalMs: natural(options.cordisIntervalMs ?? DEFAULT_CORDIS_INTERVAL_MS, 'cordisIntervalMs', {
      min: MIN_CORDIS_INTERVAL_MS,
      max: MAX_CORDIS_INTERVAL_MS,
    }),
    startupTimeoutMs: natural(options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS, 'startupTimeoutMs'),
    stopTimeoutMs: natural(options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS, 'stopTimeoutMs'),
  }
  assertOneBodyChunkFitsOneFrameNowRatherThanOnTheWire(spec)
  return Object.freeze(spec)
}

function assertOneBodyChunkFitsOneFrameNowRatherThanOnTheWire(spec) {
  const largestEncodedChunk = Math.ceil(spec.maxBodyBytes / 3) * 4 + 1_024
  if (largestEncodedChunk > spec.maxFrameBytes) {
    throw new Error('inspector: maxFrameBytes cannot carry one base64 body chunk; raise it or lower maxBodyBytes')
  }
}
