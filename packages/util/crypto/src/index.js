/**
 * UUID minting and base64 encoding that work in every JavaScript context this
 * repository ships to. `crypto.randomUUID` is a secure-context Web API — a page
 * or worker served over plain HTTP on a LAN address has no such method — while
 * `crypto.getRandomValues` is unrestricted everywhere (browsers, workers,
 * Node). One implementation here replaces per-caller polyfills.
 */

/**
 * Generate an RFC 4122 version 4 UUID without requiring a secure context.
 * @returns {string} a UUID backed by `crypto.getRandomValues()`, which browsers expose on insecure origins.
 */
export function randomUUID() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Encode bytes as canonical base64 without overflowing `String.fromCharCode`'s argument limit.
 * @param {Uint8Array} data - bytes to encode.
 * @returns {string} base64 text.
 */
export function bytesToBase64(data) {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < data.length; offset += chunk) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}
