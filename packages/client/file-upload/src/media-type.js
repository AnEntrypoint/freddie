/**
 * Magic-byte media-type sniffing for staged uploads.
 *
 * A browser-supplied content type is a claim, not a fact: the same bytes can
 * arrive labelled `image/png` and be anything. The host decides what a staged
 * file actually is from its first bytes and never from the request.
 * @module @freddie/freddie-client-file-upload/media-type
 */

/** Bytes of one upload prefix kept for sniffing. */
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

/**
 * Classify one upload from its leading bytes.
 * @param bytes - the first {@link SNIFF_BYTES} bytes (or fewer) of the upload.
 * @returns the media type, or undefined when no known signature matches.
 */
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

/**
 * Whether one sniffed media type can enter freddie prompt content today.
 * @param mediaType - media type produced by {@link sniffMediaType}.
 */
export function isPromptImage(mediaType) {
  return mediaType === 'image/png'
    || mediaType === 'image/jpeg'
    || mediaType === 'image/webp'
    || mediaType === 'image/gif'
}
