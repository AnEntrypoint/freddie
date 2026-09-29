import { zstdDecompressSync } from 'node:zlib'

export class PublicZstdFrameDecoder {
  started = false
  closed = false;

  *decode(source, frames) {
    if (this.started) throw new Error('Zstandard frame decoder was already started')
    if (this.closed) throw new Error('cannot start a closed Zstandard frame decoder')
    this.started = true
    try {
      for (const { start, end } of frames) {
        let decoded
        try {
          decoded = zstdDecompressSync(source.subarray(start, end))
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${start} failed validation`, {
            cause: error,
          })
        }
        yield decoded
      }
    } finally {
      this.close()
    }
  }

  close() {
    this.closed = true
  }
}
