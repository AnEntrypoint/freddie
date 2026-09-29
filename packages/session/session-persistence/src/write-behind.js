export class SessionWriteBehind {
  pending = []
  timer
  active
  barrier
  deadlineExpired = false
  automaticPaused = false

  constructor(options) {
    this.options = options
  }

  get hasWork() {
    return this.pending.length > 0 || this.active !== undefined
  }

  enqueue(event) {
    const wasEmpty = this.pending.length === 0
    this.pending.push(structuredClone(event))
    if (this.barrier !== undefined) return
    if (this.automaticPaused) {
      this.automaticPaused = false
      this.deadlineExpired = false
      this.armTimer()
    } else if (wasEmpty) {
      this.armTimer()
    }
  }

  flush() {
    if (this.barrier !== undefined) return this.barrier
    this.cancelTimer()
    this.deadlineExpired = false
    this.automaticPaused = false
    const barrier = Promise.withResolvers()
    this.barrier = barrier.promise
    void this.drainBarrier(barrier.resolve, barrier.reject)
    return barrier.promise
  }

  cancelAutomaticWait() {
    this.cancelTimer()
    this.deadlineExpired = false
  }

  armTimer() {
    this.timer = setTimeout(() => { this.onDeadline() }, this.options.maxDelayMs)
  }

  cancelTimer() {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  onDeadline() {
    this.timer = undefined
    if (this.active !== undefined) {
      this.deadlineExpired = true
      return
    }
    this.startBackground()
  }

  startBackground() {
    const active = this.startWrite(true)
    void active.then(() => { this.continueAutomatic() }, () => {})
  }

  continueAutomatic() {
    if (this.barrier !== undefined || this.pending.length === 0) return
    if (this.deadlineExpired) {
      this.deadlineExpired = false
      this.startBackground()
    }
  }

  async drainBarrier(resolve, reject) {
    try {
      const overlapping = this.active
      if (overlapping !== undefined) {
        await Promise.allSettled([overlapping])
        this.automaticPaused = false
      }
      while (this.pending.length > 0) await this.startWrite(false)
    } catch (error) {
      this.barrier = undefined
      reject(error)
      return
    }
    this.barrier = undefined
    resolve()
  }

  startWrite(background) {
    const batch = this.pending.splice(0)
    this.cancelTimer()
    this.deadlineExpired = false
    const operation = Promise.resolve().then(() => this.options.write(batch))
    const active = operation
      .catch((error) => {
        this.pending = batch.concat(this.pending)
        this.cancelTimer()
        this.deadlineExpired = false
        this.automaticPaused = true
        if (background) this.options.reportBackgroundFailure(error)
        throw error
      })
      .finally(() => {
        this.active = undefined
      })
    this.active = active
    return active
  }
}
