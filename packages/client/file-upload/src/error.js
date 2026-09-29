export class UploadError extends Error {
  constructor(code, message, status = 400, options) {
    super(message, options)
    this.name = 'UploadError'
    this.code = code
    this.status = status
  }
}

export function sessionNotAttached(sessionId) {
  return new UploadError(
    'session/not-attached',
    `session "${String(sessionId)}" is not attached to this host`,
    404,
  )
}

export function fileNotStaged() {
  return new UploadError('upload/not-staged', 'File was not uploaded for this session.', 400)
}

export function notAnImage(mediaType) {
  return new UploadError(
    'upload/not-an-image',
    `staged upload is ${mediaType}; freddie prompt content accepts images only`,
    415,
  )
}

export function tooLarge(maxBytes) {
  return new UploadError(
    'upload/too-large',
    `upload exceeds the ${maxBytes}-byte ceiling`,
    413,
  )
}
