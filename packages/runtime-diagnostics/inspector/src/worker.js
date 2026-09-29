import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { parentPort, workerData } from 'node:worker_threads'
import { CdpHub, ElementsBackend } from './cdp.js'
import { assertLoopback, isLoopbackAddress } from './options.js'
import { CDP_PATH_PREFIX, FRAME, TOPIC } from './shared.js'
import { acceptWebSocket, isWebSocketUpgrade } from './ws.js'

const config = workerData.config
const hostSourcePort = workerData.hostSourcePort

assertLoopback(config.host, 'inspector worker')

const targetId = randomUUID()
const network = createNetworkStore(config)
const cordis = { snapshot: undefined }
const elements = new ElementsBackend(() => cordis.snapshot)

const server = createServer((request, response) => { handleHttp(request, response) })
server.on('upgrade', (request, socket, head) => { handleUpgrade(request, socket, head) })

const cdpPath = `${CDP_PATH_PREFIX}${targetId}`
const connections = new Set()

hostSourcePort.on('message', (value) => { receiveHostFrame(value) })
hostSourcePort.on('close', () => { void shutdown(0) })
hostSourcePort.start()

parentPort.on('message', (value) => {
  if (value !== null && typeof value === 'object' && value.t === 'stop') void shutdown(0)
})

let port = config.port
bind().then(
  () => {
    parentPort.postMessage({ t: FRAME.ready, host: config.host, port: boundPort(), targetId })
  },
  (error) => {
    parentPort.postMessage({ t: FRAME.failed, message: error instanceof Error ? error.message : String(error) })
    void shutdown(1)
  },
)

async function bind() {
  for (;;) {
    const attempt = port
    try {
      await listen(attempt)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('inspector: endpoint did not bind a TCP port')
      }
      if (!isLoopbackAddress(address.address)) {
        throw new Error(`inspector: endpoint bound ${JSON.stringify(address.address)} instead of loopback`)
      }
      return
    } catch (error) {
      if (!isAddressInUse(error) || attempt === 0) throw error
      if (attempt >= 65_535) {
        throw new Error(`inspector: no available loopback port from ${String(config.port)} through 65535`, { cause: error })
      }
      port = attempt + 1
      server.close()
    }
  }
}

function listen(candidate) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(candidate, config.host)
  })
}

function boundPort() {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('inspector: endpoint is not bound')
  return address.port
}

function handleHttp(request, response) {
  const pathname = pathOf(request.url)
  if (pathname === '/json' || pathname === '/json/list') {
    json(response, [target()])
    return
  }
  if (pathname === '/json/version') {
    json(response, {
      Browser: 'freddie-inspector/0',
      'Protocol-Version': '1.3',
      webSocketDebuggerUrl: cdpUrl(),
    })
    return
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('not found')
}

function handleUpgrade(request, socket, head) {
  const pathname = pathOf(request.url)
  if (pathname !== cdpPath || !isWebSocketUpgrade(request)) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    return
  }
  const acceptedSocketIsLoopbackNotJustTheListener = isLoopbackAddress(socket.remoteAddress)
  if (!acceptedSocketIsLoopbackNotJustTheListener) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    return
  }
  const connection = acceptWebSocket({
    request,
    socket,
    head,
    maxPayload: config.maxFrameBytes,
    onMessage: (text) => {
      let message
      try {
        message = JSON.parse(text)
      } catch {
        connection.close(1008, 'CDP frame must be JSON')
        return
      }
      void hub.receive(message)
    },
    onClose: () => {
      connections.delete(connection)
      hub.dispose()
    },
  })
  const hub = new CdpHub({
    targetId,
    send: (payload) => { connection.send(JSON.stringify(payload)) },
    close: () => { connection.close(1011, 'hub closed') },
    network,
    elements,
  })
  connections.add(connection)
}

function receiveHostFrame(value) {
  if (value === null || typeof value !== 'object' || value.t !== FRAME.records) return
  for (const record of value.items ?? []) {
    if (record === null || typeof record !== 'object') continue
    switch (record.topic) {
      case TOPIC.cordisTree:
        cordis.snapshot = record.payload
        elements.refresh()
        break
      case TOPIC.fetchStart:
        network.start(record.payload)
        break
      case TOPIC.fetchResponse:
        network.response(record.payload)
        break
      case TOPIC.fetchEnd:
        network.finish(record.payload)
        break
      case TOPIC.fetchError:
        network.fail(record.payload)
        break
      default:
        break
    }
  }
}

function createNetworkStore(limits) {
  const order = []
  const records = new Map()
  let journalBytes = 0

  const evict = () => {
    while (order.length > limits.maxRetainedRequests || journalBytes > limits.maxJournalBytes) {
      const oldest = order.shift()
      if (oldest === undefined) break
      const record = records.get(oldest)
      records.delete(oldest)
      journalBytes -= record?.bytes ?? 0
    }
  }

  const write = (requestId, patch) => {
    const record = records.get(requestId) ?? { bytes: 0 }
    const before = record.bytes
    Object.assign(record, patch)
    record.bytes = bodyBytes(record)
    if (!records.has(requestId)) {
      records.set(requestId, record)
      order.push(requestId)
    }
    journalBytes += record.bytes - before
    evict()
  }

  return {
    start: (payload) => write(String(payload.requestId), {
      requestId: String(payload.requestId),
      url: String(payload.url ?? ''),
      method: String(payload.method ?? 'GET'),
      headers: payload.headers ?? {},
      wallTimeMs: payload.wallTimeMs ?? Date.now(),
    }),
    response: (payload) => write(String(payload.requestId), {
      url: String(payload.url ?? ''),
      status: payload.status,
      statusText: String(payload.statusText ?? ''),
      responseHeaders: payload.headers ?? {},
      mimeType: String(payload.mimeType ?? ''),
    }),
    finish: (payload) => write(String(payload.requestId), {
      requestBody: payload.requestBody ?? '',
      responseBody: payload.responseBody ?? '',
      truncated: Boolean(payload.truncated),
    }),
    fail: (payload) => write(String(payload.requestId), {
      error: String(payload.message ?? 'fetch failed'),
      canceled: Boolean(payload.canceled),
    }),
    list: () => order.map(requestId => records.get(requestId)).filter(record => record !== undefined),
    get: requestId => records.get(String(requestId)),
  }
}

function bodyBytes(record) {
  return (record.requestBody?.length ?? 0) + (record.responseBody?.length ?? 0)
}

function target() {
  return {
    id: targetId,
    type: 'page',
    title: 'Freddie Host',
    description: 'Freddie Host Inspector target (loopback only, opt-in)',
    url: 'freddie://host',
    webSocketDebuggerUrl: cdpUrl(),
    devtoolsFrontendUrl: `devtools://devtools/bundled/devtools_app.html?ws=${config.host}:${String(boundPort())}${cdpPath}&panel=elements&noJavaScriptCompletion=true`,
  }
}

function cdpUrl() {
  return `ws://${config.host}:${String(boundPort())}${cdpPath}`
}

function pathOf(raw) {
  try {
    return new URL(raw ?? '/', 'http://inspector.invalid').pathname
  } catch {
    return ''
  }
}

function json(response, value) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function isAddressInUse(error) {
  return error instanceof Error && error.code === 'EADDRINUSE'
}

async function shutdown(code) {
  for (const connection of connections) connection.close(1001, 'inspector stopped')
  connections.clear()
  try {
    hostSourcePort.close()
  } catch (_portAlreadyClosedWhenHostDisposedChannel) {
  }
  await new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => { resolve() })
  })
  process.exit(code)
}
