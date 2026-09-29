import { WebError } from '@freddie/freddie-web'
import { deadline, timeoutOf } from '@freddie/freddie-timeout'
import { requestPinned, resolvePublicAddresses, systemLookup } from './network.js'
import { classifyContentType, decoderForCharset, isSameOrigin, parseCharset, validateFetchUrl } from './policy.js'

export const LOCAL_FETCH_PROVIDER_ID = 'http'

export class HttpFetchProvider {
  id = LOCAL_FETCH_PROVIDER_ID

  constructor(limits, lookup = systemLookup) {
    this.limits = limits
    this.lookup = lookup
  }

  available() {
    return true
  }

  async fetch(request, signal) {
    if (signal?.aborted) throw new WebError('web fetch aborted', 'WEB_ABORTED')
    using d = deadline(signal, this.limits.timeoutMs, 'WEB_FETCH_TIMEOUT')
    return await this.followAndRead(request.url, d.signal)
  }

  async followAndRead(initialUrl, signal) {
    let currentUrl = validateFetchUrl(initialUrl, this.limits.maxUrlLength)
    let redirectsFollowed = 0

    for (;;) {
      const response = await this.requestOnce(currentUrl, signal)
      try {
        if (isRedirectStatus(response.status)) {
          if (redirectsFollowed >= this.limits.maxRedirects) {
            throw new WebError(`exceeded the maximum of ${this.limits.maxRedirects} redirects`, 'WEB_REDIRECT_BLOCKED')
          }
          const location = response.headers.get('location')
          if (location === null) {
            throw new WebError(`redirect response (HTTP ${response.status}) without a Location header`, 'WEB_PROVIDER_ERROR')
          }
          const validatedTarget = validateFetchUrl(resolveRedirect(location, currentUrl).toString(), this.limits.maxUrlLength)
          if (!isSameOrigin(validatedTarget, currentUrl)) {
            throw new WebError(
              'cross-origin redirect is not followed automatically; retry against the redirect target directly',
              'WEB_REDIRECT_BLOCKED',
            )
          }
          currentUrl = validatedTarget
          redirectsFollowed++
          continue
        }
        return await this.readBody(response, currentUrl, signal)
      } finally {
        response.close()
      }
    }
  }

  async requestOnce(url, signal) {
    const headers = {
      'user-agent': this.limits.userAgent,
      'accept': 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8',
      'accept-encoding': 'gzip, deflate',
    }
    try {
      const addresses = await resolvePublicAddresses(url.hostname, signal, this.lookup)
      return await requestPinned(url, addresses, headers, signal)
    } catch (error) {
      if (error instanceof WebError) throw error
      throw translateAbortOrNetwork(error, signal)
    }
  }

  async readBody(response, finalUrl, signal) {
    const contentType = response.headers.get('content-type')
    const kind = classifyContentType(contentType)
    if (kind === undefined) {
      throw new WebError(`unsupported content type "${contentType ?? 'unknown'}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE')
    }
    const decoder = decoderForCharset(parseCharset(contentType))
    const { bytes, truncatedByBytes } = await this.readCapped(response, signal)
    const decoded = decoder.decode(bytes)
    const truncatedByChars = decoded.length > this.limits.maxBodyChars
    const content = truncatedByChars ? decoded.slice(0, this.limits.maxBodyChars) : decoded
    const body = kind === 'html' ? { kind: 'html', content } : { kind: 'text', content }

    return {
      url: finalUrl.toString(),
      statusCode: response.status,
      body,
      truncated: truncatedByBytes || truncatedByChars,
    }
  }

  async readCapped(response, signal) {
    const declared = response.headers.get('content-length')
    if (declared !== null) {
      const length = Number(declared)
      if (Number.isFinite(length) && length > this.limits.maxResponseBytes) {
        throw new WebError(`response exceeds the maximum of ${this.limits.maxResponseBytes} bytes`, 'WEB_FETCH_TOO_LARGE')
      }
    }

    const chunks = []
    let total = 0
    let truncatedByBytes = false
    try {
      for await (const value of response.body) {
        const remaining = this.limits.maxResponseBytes - total
        if (value.byteLength > remaining) {
          chunks.push(value.subarray(0, remaining))
          total += remaining
          truncatedByBytes = true
          break
        }
        chunks.push(value)
        total += value.byteLength
      }
    } catch (error) {
      throw translateAbortOrNetwork(error, signal)
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, truncatedByBytes }
  }
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function resolveRedirect(location, base) {
  try {
    return new URL(location, base)
  } catch (error) {
    throw new WebError('invalid redirect Location', 'WEB_PROVIDER_ERROR', { cause: error })
  }
}

function translateAbortOrNetwork(error, signal) {
  const timeout = timeoutOf(signal, 'WEB_FETCH_TIMEOUT')
  if (timeout !== undefined) return new WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: timeout })
  if (signal.aborted) return new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error })
  return new WebError(`web fetch failed (${error?.code ?? 'network error'})`, 'WEB_PROVIDER_ERROR', { cause: error })
}
