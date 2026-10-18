import { constants as bufferConstants } from 'node:buffer'
import { createZstdDecompress } from 'node:zlib'

const DECODE_CHUNK_SIZE = 1024 * 1024

function privateZstdStream(stream) {
  const candidate = stream
  const handle = candidate._handle
  const errorKey = Reflect.ownKeys(stream).find(key => (
    typeof key === 'symbol' && key.description === 'kError'
  ))
  if (
    typeof handle !== 'object' || handle === null
    || typeof handle.writeSync !== 'function'
    || !(candidate._writeState instanceof Uint32Array)
    || candidate._writeState.length < 2
    || typeof candidate._defaultFlushFlag !== 'number'
    || errorKey === undefined
    || candidate[errorKey] !== null
  ) return undefined
  return { stream, errorKey }
}

export class NodePrivateZstdFrameDecoder {
  output = Buffer.allocUnsafe(DECODE_CHUNK_SIZE)
  decoderError
  started = false
  closed = false

  constructor(stream, errorKey) {
    this.stream = stream
    this.errorKey = errorKey
    this.stream.on('error', (error) => {
      this.decoderError ??= error
    })
  }

  static create() {
    const stream = createZstdDecompress({ chunkSize: DECODE_CHUNK_SIZE })
    const privateAccess = privateZstdStream(stream)
    if (privateAccess !== undefined) {
      return new NodePrivateZstdFrameDecoder(privateAccess.stream, privateAccess.errorKey)
    }
    stream.close()
    return undefined
  }

  *decode(source, frames) {
    if (this.started) throw new Error('Zstandard frame decoder was already started')
    if (this.closed) throw new Error('cannot start a closed Zstandard frame decoder')
    this.started = true
    try {
      for (const frame of frames) {
        try {
          yield this.decodeFrame(source.subarray(frame.start, frame.end))
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${frame.start} failed validation`, {
            cause: error,
          })
        }
      }
    } finally {
      this.close()
    }
  }

  decodeFrame(input) {
    const handle = this.stream._handle
    if (this.closed || handle === null) throw new Error('cannot decode with a closed Zstandard frame decoder')

    let inputOffset = 0
    let inputRemaining = input.length
    let outputBytes = 0
    const fullChunks = []
    for (;;) {
      handle.writeSync(
        this.stream._defaultFlushFlag,
        input,
        inputOffset,
        inputRemaining,
        this.output,
        0,
        this.output.length,
      )
      if (this.decoderError !== undefined) throw this.decoderError
      const internalError = this.stream[this.errorKey]
      if (internalError !== null) {
        if (internalError instanceof Error) throw internalError
        throw new Error('Zstandard decoder exposed a non-Error internal failure')
      }

      const outputAfter = this.stream._writeState[0]
      const inputAfter = this.stream._writeState[1]
      const consumed = inputRemaining - inputAfter
      const produced = this.output.length - outputAfter
      if (produced > 0) {
        outputBytes += produced
        if (outputBytes > bufferConstants.MAX_LENGTH) {
          throw new Error(`Zstandard frame output exceeds ${bufferConstants.MAX_LENGTH} bytes`)
        }
      }

      if (outputAfter !== 0) {
        if (inputAfter !== 0) throw new Error('Zstandard frame decoder left trailing input')
        const finalChunk = this.output.subarray(0, produced)
        if (fullChunks.length === 0) return finalChunk
        if (produced > 0) fullChunks.push(Buffer.from(finalChunk))
        const onlyChunk = fullChunks[0]
        return fullChunks.length === 1
          ? onlyChunk
          : Buffer.concat(fullChunks, outputBytes)
      }
      fullChunks.push(Buffer.from(this.output))
      inputOffset += consumed
      inputRemaining = inputAfter
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.stream.close()
  }
}
