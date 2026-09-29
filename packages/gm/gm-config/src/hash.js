const FNV_OFFSET = 1469598103934665603n
const FNV_PRIME = 1099511628211n
const U64 = 0xffffffffffffffffn

export function fnv1a64Hex(text) {
  const bytes = Buffer.from(text, 'utf8')
  let h = FNV_OFFSET
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * FNV_PRIME) & U64
  }
  return h.toString(16).padStart(16, '0')
}
