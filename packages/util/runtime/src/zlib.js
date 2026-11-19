import { activeRuntime } from './runtime.js'

const { zlib } = activeRuntime()

export const brotliCompress = zlib.brotliCompress
export const constants = zlib.constants
export const createZstdDecompress = zlib.createZstdDecompress
export const gunzip = zlib.gunzip
export const gzip = zlib.gzip
export const zstdCompress = zlib.zstdCompress
export const zstdDecompress = zlib.zstdDecompress
export const zstdDecompressSync = zlib.zstdDecompressSync
export default zlib
