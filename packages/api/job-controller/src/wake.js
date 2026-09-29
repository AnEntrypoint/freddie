export class OutputWaiter {
  #dirty = false
  #resolve

  wake() {
    this.#dirty = true
    this.#resolve?.()
  }

  wait(signal) {
    if (this.#dirty || signal.aborted) {
      this.#dirty = false
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const finish = () => {
        signal.removeEventListener('abort', finish)
        if (this.#resolve === finish) this.#resolve = undefined
        this.#dirty = false
        resolve()
      }
      this.#resolve = finish
      signal.addEventListener('abort', finish, { once: true })
    })
  }
}

export function sleep(ms, signal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
