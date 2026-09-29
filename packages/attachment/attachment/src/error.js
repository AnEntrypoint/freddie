
const IMAGE_ADMISSION_ERROR_CODES = [
  'TOO_MANY_IMAGES',
  'IMAGES_TOO_LARGE',
  'UNSUPPORTED_IMAGE_TYPE',
  'INVALID_IMAGE_BASE64',
  'INVALID_IMAGE',
  'IMAGE_TYPE_MISMATCH',
  'IMAGE_TOO_LARGE',
  'IMAGE_TOO_MANY_PIXELS',
  'IMAGE_DIMENSION_TOO_LARGE',
]

const IMAGE_ADMISSION_ERROR_CODE_SET = new Set(IMAGE_ADMISSION_ERROR_CODES)

export class AttachmentError extends Error {
  constructor(message, code, options) {
    super(message, options)
    this.name = 'AttachmentError'
    this.code = code
  }
}

export function isImageAdmissionError(error) {
  return error instanceof Error
    && 'code' in error
    && typeof error.code === 'string'
    && IMAGE_ADMISSION_ERROR_CODE_SET.has(error.code)
}
