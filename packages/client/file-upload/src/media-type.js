export const SNIFF_BYTES = 16

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function ascii(bytes, start, end) {
  let out = ''
  for (let index = start; index < end; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

function startsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte)
}

export function sniffMediaType(bytes) {
  if (bytes.byteLength >= 8 && startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.byteLength >= 6) {
    const gif = ascii(bytes, 0, 6)
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return undefined
}

export function isPromptImage(mediaType) {
  return mediaType === 'image/png'
    || mediaType === 'image/jpeg'
    || mediaType === 'image/webp'
    || mediaType === 'image/gif'
}
