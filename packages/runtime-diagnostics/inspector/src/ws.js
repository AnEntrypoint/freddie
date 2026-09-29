/**
 * Minimal RFC 6455 WebSocket server for the Inspector endpoint.
 *
 * Upstream depends on `ws`. freddie's port adds no npm dependency, so the
 * handshake and framing this endpoint needs are owned here: one upgrade
 * response, text frames with continuation and masking, ping/pong, and the close
 * handshake, with a hard payload ceiling. Binary frames are refused — CDP is
 * text.
 * @module @freddie/freddie-inspector/ws
 */

import { createHash } from 'node:crypto'

/** RFC 6455 §4.2.2 / §1.3 handshake digest constant. */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const OPCODE_CONTINUATION = 0x0
const OPCODE_TEXT = 0x1
const OPCODE_BINARY = 0x2
const OPCODE_CLOSE = 0x8
const OPCODE_PING = 0x9
const OPCODE_PONG = 0xa

/**
 * Compute the `Sec-WebSocket-Accept` value for one client key.
 * @param {string} key - the request's `Sec-WebSocket-Key`.
 * @returns {string} base64 accept token.
 */
export function acceptToken(key) {
  return createHash('sha1').update(`${key}${GUID}`).digest('base64')
}

/**
 * Whether an upgrade request is a WebSocket opening handshake this server accepts.
 * @param {import('node:http').IncomingMessage} request - upgrade request.
 * @returns {boolean} true when the handshake may proceed.
 */
export function isWebSocketUpgrade(request) {
  if (request.method !== 'GET') return false
  const upgrade = String(request.headers.upgrade ?? '').toLowerCase()
  if (!upgrade.split(',').some(value => value.trim() === 'websocket')) return false
  if (String(request.headers['sec-websocket-version'] ?? '') !== '13') return false
  return typeof request.headers['sec-websocket-key'] === 'string'
}

/**
 * Complete the handshake over a raw socket and return the framed connection.
 *
 * @param {object} args - connection inputs.
 * @param {import('node:http').IncomingMessage} args.request - upgrade request.
 * @param {import('node:net').Socket} args.socket - the raw TCP socket.
 * @param {Buffer} args.head - bytes already read after the request head.
 * @param {number} args.maxPayload - payload ceiling; exceeding it closes the connection.
 * @param {(text: string) => void} args.onMessage - one complete text message.
 * @param {() => void} args.onClose - the connection is gone, in either direction.
 * @returns {{ send: (text: string) => void, close: (code: number, reason: string) => void }} the connection.
 */
export function acceptWebSocket({ request, socket, head, maxPayload, onMessage, onClose }) {
  const key = String(request.headers['sec-websocket-key'])
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${acceptToken(key)}\r\n\r\n`,
  )

  const connection = new WebSocketConnection(socket, maxPayload, onMessage, onClose)
  if (head !== undefined && head.length > 0) connection.receive(head)
  return connection
}

/**
 * One framed WebSocket connection over an already-upgraded socket.
 */
class WebSocketConnection {
  #socket
  #maxPayload
  #onMessage
  #onClose
  #chunks = []
  #pending = []
  #fragmentOpcode = OPCODE_CONTINUATION
  #closed = false

  constructor(socket, maxPayload, onMessage, onClose) {
    this.#socket = socket
    this.#maxPayload = maxPayload
    this.#onMessage = onMessage
    this.#onClose = onClose
    socket.on('data', (chunk) => { this.receive(chunk) })
    socket.on('error', () => { this.#finish() })
    socket.on('close', () => { this.#finish() })
  }

  /** Consume raw bytes, dispatching every complete message. */
  receive(chunk) {
    if (this.#closed) return
    let buffer = this.#chunks.length > 0 ? Buffer.concat([...this.#chunks, chunk]) : chunk
    this.#chunks = []
    for (;;) {
      const frame = readFrame(buffer, this.#maxPayload)
      if (frame === null) break
      if (frame.tooBig) {
        this.close(1009, 'message too big')
        return
      }
      buffer = frame.rest
      if (!this.#dispatch(frame)) return
    }
    if (buffer.length > 0) this.#chunks.push(buffer)
  }

  /**
   * Apply one parsed frame.
   * @param {{ fin: boolean, opcode: number, payload: Buffer }} frame - parsed frame.
   * @returns {boolean} false once the connection must stop reading.
   */
  #dispatch(frame) {
    if (frame.opcode === OPCODE_CLOSE) {
      const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000
      this.close(code === 1005 || code < 1000 ? 1000 : code, '')
      return false
    }
    if (frame.opcode === OPCODE_PING) {
      this.#writeFrame(OPCODE_PONG, frame.payload)
      return true
    }
    if (frame.opcode === OPCODE_PONG) return true
    if (frame.opcode === OPCODE_BINARY) {
      this.close(1003, 'binary frames are not accepted')
      return false
    }
    if (frame.opcode === OPCODE_TEXT) {
      if (this.#fragmentOpcode !== OPCODE_CONTINUATION) {
        this.close(1002, 'interleaved fragments')
        return false
      }
      this.#fragmentOpcode = frame.fin ? OPCODE_CONTINUATION : OPCODE_TEXT
      if (frame.fin) {
        const message = Buffer.concat([...this.#pending, frame.payload])
        this.#pending = []
        this.#deliver(message)
      } else {
        this.#pending = [frame.payload]
      }
      return true
    }
    if (frame.opcode === OPCODE_CONTINUATION) {
      if (this.#fragmentOpcode !== OPCODE_TEXT) {
        this.close(1002, 'unexpected continuation')
        return false
      }
      this.#pending.push(frame.payload)
      const size = this.#pending.reduce((total, part) => total + part.length, 0)
      if (size > this.#maxPayload) {
        this.close(1009, 'message too big')
        return false
      }
      if (frame.fin) {
        this.#fragmentOpcode = OPCODE_CONTINUATION
        this.#deliver(Buffer.concat(this.#pending))
        this.#pending = []
      }
      return true
    }
    this.close(1002, 'unknown opcode')
    return false
  }

  #deliver(payload) {
    try {
      this.#onMessage(payload.toString('utf8'))
    } catch {
      this.close(1011, 'message handler failed')
    }
  }

  /**
   * Send one text frame.
   * @param {string} text - payload, UTF-8.
   * @returns {void}
   */
  send(text) {
    if (this.#closed) return
    this.#writeFrame(OPCODE_TEXT, Buffer.from(text, 'utf8'))
  }

  /**
   * Close the connection, writing the close frame when the socket is writable.
   * @param {number} code - WebSocket close code.
   * @param {string} reason - short reason; truncated to the protocol's 123 bytes.
   * @returns {void}
   */
  close(code, reason) {
    if (this.#closed) return
    this.#closed = true
    const body = Buffer.alloc(2 + Buffer.byteLength(reason.slice(0, 123)))
    body.writeUInt16BE(code, 0)
    body.write(reason.slice(0, 123), 2, 'utf8')
    this.#writeFrame(OPCODE_CLOSE, body)
    this.#socket.end()
  }

  #finish() {
    if (this.#onClose === undefined) return
    const notify = this.#onClose
    this.#onClose = undefined
    this.#closed = true
    notify()
  }

  #writeFrame(opcode, payload) {
    if (this.#socket.destroyed) return
    const length = payload.length
    let header
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, length])
    } else if (length < 65_536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 126
      header.writeUInt16BE(length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 127
      header.writeBigUInt64BE(BigInt(length), 2)
    }
    this.#socket.write(Buffer.concat([header, payload]))
  }
}

/**
 * Parse the first complete frame of a buffer.
 * @param {Buffer} buffer - unread bytes.
 * @param {number} maxPayload - payload ceiling.
 * @returns {{ fin: boolean, opcode: number, payload: Buffer, rest: Buffer, tooBig?: boolean } | null}
 *   the frame and the unread remainder, or `null` when the frame is incomplete.
 */
function readFrame(buffer, maxPayload) {
  if (buffer.length < 2) return null
  const first = buffer[0]
  const second = buffer[1]
  const fin = (first & 0x80) !== 0
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let length = second & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < offset + 2) return null
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null
    const value = buffer.readBigUInt64BE(offset)
    if (value > BigInt(maxPayload)) return { fin, opcode, payload: Buffer.alloc(0), rest: Buffer.alloc(0), tooBig: true }
    length = Number(value)
    offset += 8
  }
  if (length > maxPayload) return { fin, opcode, payload: Buffer.alloc(0), rest: Buffer.alloc(0), tooBig: true }
  if (!masked) return { fin, opcode, payload: Buffer.alloc(0), rest: Buffer.alloc(0), tooBig: true }
  if (buffer.length < offset + 4 + length) return null
  const key = buffer.subarray(offset, offset + 4)
  offset += 4
  const payload = Buffer.from(buffer.subarray(offset, offset + length))
  for (let index = 0; index < payload.length; index += 1) payload[index] ^= key[index % 4]
  return { fin, opcode, payload, rest: buffer.subarray(offset + length) }
}
