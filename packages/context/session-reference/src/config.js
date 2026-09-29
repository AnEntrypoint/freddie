
export const MAX_REFERENCES = 3
export const DEFAULT_CANDIDATE_LIMIT = 50
export const DEFAULT_MAX_REFERENCE_BYTES = 65_536

export class SessionReferenceError extends Error {
  constructor(
    message,
    code,
    options,
  ) {
    super(message, options)
    this.code = code
    this.name = 'SessionReferenceError'
  }
}
