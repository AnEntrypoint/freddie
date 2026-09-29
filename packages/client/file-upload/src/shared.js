export const FILE_UPLOAD_PATH = '/api/session/uploadFileBinary'

export const FILE_UPLOAD_ROUTE = FILE_UPLOAD_PATH.slice(1)

export const FILE_UPLOAD_TRUSTED_HOSTS = Object.freeze([])

export const PROMPT_IMAGE_MEDIA_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export const MAX_DISPLAY_NAME_LENGTH = 255

const FIRST_PRINTABLE_CODE_POINT = 0x20

const DELETE_CODE_POINT = 0x7f

function stripControls(value) {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code >= FIRST_PRINTABLE_CODE_POINT && code !== DELETE_CODE_POINT) out += char
  }
  return out
}

export function displayName(raw) {
  if (typeof raw !== 'string') return undefined
  const leaf = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = stripControls(leaf).replace(/^\.+/, '').trim()
  if (cleaned === '') return undefined
  return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH)
}
