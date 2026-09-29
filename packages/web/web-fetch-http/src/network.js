import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { pipeline } from 'node:stream'
import zlib from 'node:zlib'
import { WebError } from '@freddie/freddie-web'
import { classifyAddress, normalizeHostname, unbracket } from './address.js'

const MAX_CONTENT_ENCODINGS = 2

export function systemLookup(hostname, options) {
  return dns.lookup(hostname, options)
}

export async function resolvePublicAddresses(hostname, signal, lookup = systemLookup) {
  const host = normalizeHostname(hostname)
  const literalFamily = isIP(host)
  let resolved
  if (literalFamily === 0) {
    try {
      resolved = await raceWithSignal(lookup(host, { all: true, order: 'verbatim' }), signal)
    } catch (error) {
      if (signal.aborted) throw error
      throw new WebError(`hostname could not be resolved (${error?.code ?? 'lookup failed'})`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  } else {
    resolved = [{ address: host, family: literalFamily }]
  }
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new WebError('hostname resolved to no addresses', 'WEB_PROVIDER_ERROR')
  }
  const addresses = []
  for (const entry of resolved) {
    const family = isIP(entry?.address ?? '')
    if (family === 0 || entry.family !== family) {
      throw new WebError('hostname resolved to an invalid address', 'WEB_PROVIDER_ERROR')
    }
    const reason = classifyAddress(entry.address)
    if (reason !== undefined) {
      throw new WebError(`URL destination is not a public address (${reason})`, 'WEB_BLOCKED_URL')
    }
    addresses.push({ address: entry.address, family })
  }
  return addresses
}

export function createPinnedLookup(addresses) {
  return (hostname, options, callback) => {
    const requested = typeof options?.family === 'number' ? options.family : options?.family === 'IPv4' ? 4 : options?.family === 'IPv6' ? 6 : 0
    const eligible = requested === 0 ? addresses : addresses.filter(entry => entry.family === requested)
    if (eligible.length === 0) {
      const error = Object.assign(new Error('no validated address for this family'), { code: 'ENOTFOUND', hostname })
      callback(error, options?.all === true ? [] : '', requested)
      return
    }
    if (options?.all === true) {
      callback(null, eligible.map(entry => ({ address: entry.address, family: entry.family })))
      return
    }
    callback(null, eligible[0].address, eligible[0].family)
  }
}

export function requestPinned(url, addresses, headers, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    let settled = false
    const request = transport.request({
      hostname: unbracket(url.hostname),
      port: url.port === '' ? undefined : Number(url.port),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers,
      agent: false,
      lookup: createPinnedLookup(addresses),
      signal,
    })
    request.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    request.on('response', (response) => {
      if (settled) {
        response.destroy()
        return
      }
      settled = true
      try {
        resolve(openResponse(response, signal))
      } catch (error) {
        response.destroy()
        reject(error)
      }
    })
    request.end()
  })
}

function openResponse(response, signal) {
  const encodings = String(response.headers['content-encoding'] ?? '')
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(token => token !== '' && token !== 'identity')
  if (encodings.length > MAX_CONTENT_ENCODINGS) {
    throw new WebError('unsupported content-encoding chain', 'WEB_PROVIDER_ERROR')
  }
  const decoders = encodings.reverse().map(decoderFor)
  const body = decoders.length === 0 ? response : pipeline(response, ...decoders, () => {})
  response.on('error', () => {})
  const onAbort = () => response.destroy(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  const release = () => {
    signal.removeEventListener('abort', onAbort)
  }
  response.once('close', release)
  return {
    status: response.statusCode,
    headers: {
      get: (name) => {
        const value = response.headers[name.toLowerCase()]
        if (value === undefined) return null
        return Array.isArray(value) ? value.join(', ') : value
      },
    },
    body,
    encoded: decoders.length > 0,
    close: () => {
      body.destroy()
      response.destroy()
      release()
    },
  }
}

function decoderFor(encoding) {
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip()
  if (encoding === 'deflate') return zlib.createInflate()
  if (encoding === 'br') return zlib.createBrotliDecompress()
  throw new WebError('unsupported content-encoding', 'WEB_PROVIDER_ERROR')
}

function raceWithSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}
