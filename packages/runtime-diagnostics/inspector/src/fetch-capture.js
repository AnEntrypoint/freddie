import { TOPIC } from './shared.js'
import { redactHeaders, redactText, redactUrl } from './redact.js'

export function installFetchObserver(publisher, options) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const original = globalThis.fetch
  if (typeof original !== 'function') throw new Error('inspector: globalThis.fetch is unavailable')
  if (descriptor !== undefined && !('value' in descriptor)) {
    throw new Error('inspector: globalThis.fetch is an accessor and cannot be observed safely')
  }

  const pending = new Set()
  let nextRequestId = 0

  const track = (promise) => {
    pending.add(promise)
    const release = () => { pending.delete(promise) }
    promise.then(release, release)
  }

  const observedFetch = async (input, init) => {
    const request = new Request(input, init)
    const requestId = `fetch-${++nextRequestId}`
    const cloneTakenBeforeFetchConsumesBody = options.captureBodies && request.body !== null ? request.clone() : undefined
    publisher.publish(TOPIC.fetchStart, {
      requestId,
      url: redactUrl(request.url),
      method: request.method,
      headers: redactHeaders(request.headers),
      hasBody: request.body !== null,
      wallTimeMs: Date.now(),
    })

    let response
    try {
      response = await Reflect.apply(original, globalThis, [request])
    } catch (error) {
      publisher.publish(TOPIC.fetchError, {
        requestId,
        message: renderError(error),
        canceled: request.signal.aborted || isAbortError(error),
      })
      throw error
    }

    publisher.publish(TOPIC.fetchResponse, {
      requestId,
      url: redactUrl(response.url || request.url),
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders(response.headers),
      mimeType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '',
    })

    const end = { requestId, requestBody: null, responseBody: null, truncated: false }
    const reads = []
    if (cloneTakenBeforeFetchConsumesBody !== undefined) {
      reads.push(readBounded(cloneTakenBeforeFetchConsumesBody, options.maxBodyBytes).then((outcome) => {
        end.requestBody = outcome.text
        end.truncated ||= outcome.truncated
      }))
    }
    if (options.captureBodies) {
      reads.push(readBounded(response.clone(), options.maxBodyBytes).then((outcome) => {
        end.responseBody = outcome.text
        end.truncated ||= outcome.truncated
      }))
      for (const read of reads) track(read)
    }
    track(Promise.allSettled(reads).then(() => {
      publisher.publish(TOPIC.fetchEnd, end)
    }))

    return response
  }

  Object.defineProperty(observedFetch, 'name', { value: original.name, configurable: true })
  Object.defineProperty(observedFetch, 'length', { value: original.length, configurable: true })
  Object.defineProperty(globalThis, 'fetch', descriptor === undefined
    ? { value: observedFetch, writable: true, configurable: true }
    : { ...descriptor, value: observedFetch })

  let stopped
  return {
    stop() {
      if (stopped !== undefined) return stopped
      stopped = (async () => {
        const current = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
        if (current !== undefined && 'value' in current && current.value === observedFetch) {
          if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'fetch')
          else Object.defineProperty(globalThis, 'fetch', descriptor)
        }
        await Promise.allSettled([...pending])
      })()
      return stopped
    },
  }
}

async function readBounded(source, limit) {
  try {
    const raw = await source.text()
    const slice = raw.length > limit ? raw.slice(0, limit) : raw
    return { text: redactText(slice), truncated: raw.length > limit }
  } catch {
    return { text: null, truncated: true }
  }
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function renderError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return String(error)
  } catch {
    return 'unrenderable fetch error'
  }
}
