export const INSPECTOR_HOST = '127.0.0.1'

export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1', 'localhost'])

export const DEFAULT_PORT = 9230

export const TOPIC = Object.freeze({
  cordisTree: 'cordis/tree',
  fetchStart: 'fetch/start',
  fetchResponse: 'fetch/response',
  fetchEnd: 'fetch/end',
  fetchError: 'fetch/error',
})

export const FRAME = Object.freeze({
  records: 'records',
  ready: 'ready',
  failed: 'failed',
})

export const CDP_PATH_PREFIX = '/devtools/page/'

export const REDACTED = '[redacted]'
