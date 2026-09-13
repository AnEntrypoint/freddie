/** Browser API carrier: HTTP upstream plus one WebSocket per downstream event stream. */

import { AbstractApiClient } from './api.js'
import { serverRequestSchema } from '@freddie/freddie-host-apiproxy/api/rpc.schema'
import { HOST_EVENTS_PATH, MUX_EVENTS_PATH } from '../api-path.js'

const MAX_INBOX_ITEMS = 2048

/** Browser platform subclass: unary/respond use fetch; mux/host use downlink-only WebSockets. */
export class WebApiClient extends AbstractApiClient {
  doFetch(input, init) {
    return globalThis.fetch(input, init)
  }

  openMux(
    _payload,
    signal,
    onOpen,
  ) {
    return this.readWebSocket(MUX_EVENTS_PATH, signal, onOpen)
  }

  openHost(
    _payload,
    signal,
    onOpen,
  ) {
    return this.readWebSocket(HOST_EVENTS_PATH, signal, onOpen)
  }

  async *readWebSocket(
    path,
    signal,
    onOpen,
  ) {
    const url = new URL(path, this.resolveBase())
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    const inbox = []
    let head = 0
    let wake
    const enqueue = (item) => {
      if (inbox.length - head >= MAX_INBOX_ITEMS) {
        inbox.length = 0
        head = 0
        inbox.push({ kind: 'end' })
        socket.close(1013, 'client event queue overloaded')
      } else {
        inbox.push(item)
      }
      wake?.()
      wake = undefined
    }
    const handleOpen = () => { onOpen?.() }
    const handleMessage = (event) => {
      let full
      try {
        if (typeof event.data !== 'string') throw new Error('binary WebSocket frame')
        full = serverRequestSchema.parse(JSON.parse(event.data))
      } catch (error) {
        // A malformed server frame makes this stream untrustworthy. End this
        // generation so ConnectionController rebuilds both subscriptions.
        console.error(`[client-connection] malformed WebSocket frame on ${path}:`, error)
        enqueue({ kind: 'end' })
        socket.close(1002, 'invalid server frame')
        return
      }
      this.onEnvelope(full)
      enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: full.payload } })
    }
    const handleClose = () => { enqueue({ kind: 'end' }) }
    const handleError = () => { enqueue({ kind: 'end' }) }
    const handleAbort = () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
    }
    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) handleAbort()
    try {
      while (true) {
        while (head < inbox.length) {
          const item = inbox[head]
          head += 1
          if (item.kind === 'end') return
          yield item.envelope
        }
        inbox.length = 0
        head = 0
        await new Promise((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', handleAbort)
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      socket.removeEventListener('error', handleError)
      handleAbort()
    }
  }
}
