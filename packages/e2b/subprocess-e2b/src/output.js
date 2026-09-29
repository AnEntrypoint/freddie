import { Buffer } from 'node:buffer'

const BASE64_TEXT = /^[A-Za-z0-9+/]+={0,2}$/u

export const E2B_OUTPUT_COMPLETE_FRAME = '!freddie-e2b-output-complete!'

export class E2BBase64Decoder {
  pending = ''
  complete = false

  push(text) {
    if (text.length === 0) return Buffer.alloc(0)
    this.pending += text
    const decoded = []
    for (;;) {
      const boundary = this.pending.indexOf('\n')
      if (boundary < 0) break
      const frame = this.pending.slice(0, boundary)
      this.pending = this.pending.slice(boundary + 1)
      if (frame === E2B_OUTPUT_COMPLETE_FRAME) {
        if (this.complete) throw new Error('subprocess-e2b: duplicate output transport completion')
        this.complete = true
        continue
      }
      if (this.complete) throw new Error('subprocess-e2b: output transport continued after completion')
      if (!BASE64_TEXT.test(frame)) {
        throw new Error('subprocess-e2b: invalid base64 output transport')
      }
      const bytes = Buffer.from(frame, 'base64')
      if (bytes.toString('base64') !== frame) {
        throw new Error('subprocess-e2b: invalid base64 output transport')
      }
      decoded.push(bytes)
    }
    return Buffer.concat(decoded)
  }

  finish(requireComplete = true) {
    if (!requireComplete) {
      this.pending = ''
      return
    }
    if (this.pending.length > 0) {
      throw new Error('subprocess-e2b: truncated base64 output transport')
    }
    if (!this.complete) throw new Error('subprocess-e2b: incomplete output transport')
  }
}

export class E2BOutputReader {
  chunks = []
  retainedBytes = 0
  totalBytes = 0
  spillValid = true

  constructor(maxBytes, maxSpillBytes, spillPath) {
    this.maxBytes = maxBytes
    this.maxSpillBytes = maxSpillBytes
    this.spillPath = spillPath
  }

  get size() {
    return this.totalBytes
  }

  invalidateSpill() {
    this.spillValid = false
  }

  push(bytes) {
    if (bytes.length === 0) return
    const chunk = Buffer.from(bytes)
    this.totalBytes += chunk.length
    this.chunks.push(chunk)
    this.retainedBytes += chunk.length
    while (this.retainedBytes > this.maxBytes) {
      const head = this.chunks[0]
      const excess = this.retainedBytes - this.maxBytes
      if (head.length <= excess) {
        this.chunks.shift()
        this.retainedBytes -= head.length
      } else {
        this.chunks[0] = head.subarray(excess)
        this.retainedBytes -= excess
      }
    }
  }

  readFrom(fromByte) {
    const retained = Buffer.concat(this.chunks, this.retainedBytes)
    const firstRetained = this.totalBytes - this.retainedBytes
    const lossy = fromByte < firstRetained
    const start = lossy ? 0 : Math.min(retained.length, Math.max(0, fromByte - firstRetained))
    return {
      text: retained.subarray(start).toString('utf8'),
      nextOffset: this.totalBytes,
      lossy,
      ...(lossy && this.spillValid && this.maxSpillBytes !== undefined && this.totalBytes <= this.maxSpillBytes
        ? { spillPath: this.spillPath }
        : {}),
    }
  }
}
