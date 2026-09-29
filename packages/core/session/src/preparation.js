export class SessionPreparation {
  released = false

  session

  constructor(session, options) {
    this.session = session
    this.options = options
  }

  static create(session, options) {
    return new SessionPreparation(session, options ?? {})
  }

  [Symbol.dispose]() {
    if (this.released) return
    this.released = true
    this.options.release?.()
  }
}
