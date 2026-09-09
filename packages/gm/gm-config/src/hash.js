/**
  * FNV-1a 64-bit, matching rs-plugkit `crate::hash::fnv1a64`.
  * @module @freddie/freddie-gm-config/src/hash
  */

const FNV_OFFSET = 1469598103934665603n
const FNV_PRIME = 1099511628211n
const U64 = 0xffffffffffffffffn

/**
  * Hash UTF-8 bytes with FNV-1a 64 and return a 16-character lowercase hex string.
  * @param text - input string (repo|ref|path identity).
  * @returns sixteen hex digits, zero-padded.
  */
export function fnv1a64Hex(text) {
  const bytes = Buffer.from(text, 'utf8')
  let h = FNV_OFFSET
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * FNV_PRIME) & U64
  }
  return h.toString(16).padStart(16, '0')
}
