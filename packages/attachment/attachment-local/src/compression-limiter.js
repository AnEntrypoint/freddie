
export class CompressionLimiter {
  active = 0
  waiting = []

  constructor(concurrency) {
    this.concurrency = concurrency
  }

  run(task) {
    return new Promise((resolve, reject) => {
      const start = () => {
        this.active += 1
        const release = () => {
          this.active -= 1
          this.waiting.shift()?.()
        }
        void Promise.resolve().then(task).then(
          (value) => {
            release()
            resolve(value)
          },
          (error) => {
            release()
            reject(error instanceof Error
              ? error
              : new Error('Image compression task rejected with a non-Error value.', { cause: error }))
          },
        )
      }
      if (this.active < this.concurrency) start()
      else this.waiting.push(start)
    })
  }
}
