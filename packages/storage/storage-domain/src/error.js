export class DomainError extends Error {
  name = 'DomainError'

  detail

  constructor(code, message, options) {
    super(message, options)
    this.code = code
    if (options?.detail) this.detail = options.detail
  }
}
