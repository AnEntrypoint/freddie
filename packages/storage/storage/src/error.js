export class StorageError extends Error {
  name = 'StorageError'

  constructor(code, message, options) {
    super(message, options)
    this.code = code
  }
}
