/**
 * Domain errors raised by the file-upload host half. Every one carries the
 * wire code the route answers with, so the browser sees a stable reason and
 * never a stack.
 * @module @freddie/freddie-client-file-upload/error
 */

/** One refused or failed upload operation. */
export class UploadError extends Error {
  /**
   * @param code - stable wire code.
   * @param message - human-readable reason; never carries upload bytes.
   * @param status - HTTP status the route answers with.
   * @param options - optional `cause`.
   */
  constructor(code, message, status = 400, options) {
    super(message, options)
    this.name = 'UploadError'
    this.code = code
    this.status = status
  }
}

/** Session id is absent, malformed, or names no session attached to this host. */
export function sessionNotAttached(sessionId) {
  return new UploadError(
    'session/not-attached',
    `session "${String(sessionId)}" is not attached to this host`,
    404,
  )
}

/** A receipt was presented that this session never staged. */
export function fileNotStaged() {
  return new UploadError('upload/not-staged', 'File was not uploaded for this session.', 400)
}

/** A staged upload exists but freddie's prompt content cannot carry it. */
export function notAnImage(mediaType) {
  return new UploadError(
    'upload/not-an-image',
    `staged upload is ${mediaType}; freddie prompt content accepts images only`,
    415,
  )
}

/** Bytes exceeded the configured ceiling. */
export function tooLarge(maxBytes) {
  return new UploadError(
    'upload/too-large',
    `upload exceeds the ${maxBytes}-byte ceiling`,
    413,
  )
}
