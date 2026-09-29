import { Service } from '@freddie/cordis'


export class ClientTimerService extends Service {
  constructor(ctx) {
    super(ctx, 'timer')
    ctx.mixin('timer', ['timeout', 'interval', 'throttle', 'debounce', 'setTimeout', 'setInterval'])
  }

  setTimeout(callback, delay) {
    return this.timeout(callback, delay)
  }

  setInterval(callback, delay) {
    return this.interval(callback, delay)
  }

  timeout(...args) {
    const callback = typeof args[0] === 'function' ? args.shift() : undefined
    const delay = args[0]
    if (callback !== undefined) {
      const dispose = this.ctx.effect(() => {
        const timer = globalThis.setTimeout(() => {
          void dispose()
          callback()
        }, delay)
        return () => { globalThis.clearTimeout(timer) }
      }, 'ctx.timeout()')
      return dispose
    }

    const { promise, resolve, reject } = Promise.withResolvers()
    const dispose = this.ctx.effect(() => {
      const timer = globalThis.setTimeout(resolve, delay)
      return () => {
        globalThis.clearTimeout(timer)
        reject(new Error('Context has been disposed'))
      }
    }, 'ctx.timeout()')
    return promise.finally(() => { void dispose() })
  }

  interval(...args) {
    const callback = typeof args[0] === 'function' ? args.shift() : undefined
    const delay = args[0]
    if (callback !== undefined) {
      return this.ctx.effect(() => {
        const timer = globalThis.setInterval(callback, delay)
        return () => { globalThis.clearInterval(timer) }
      }, 'ctx.interval()')
    }

    let done
    let nextTask
    const dispose = this.ctx.effect(() => {
      const timer = globalThis.setInterval(() => {
        nextTask?.resolve({ done: false, value: undefined })
      }, delay)
      return () => {
        globalThis.clearInterval(timer)
        if (done !== undefined) return
        done = { kind: 'throw', reason: new Error('Context has been disposed') }
        nextTask?.reject(done.reason)
      }
    }, 'ctx.interval()')
    return {
      next: () => {
        if (done === undefined) return (nextTask = Promise.withResolvers()).promise
        if (done.kind === 'return') return Promise.resolve({ done: true, value: done.value })
        return Promise.reject(done.reason)
      },
      return: (value) => {
        if (done === undefined) done = { kind: 'return', value }
        nextTask?.resolve({ done: true, value })
        void dispose()
        return Promise.resolve({ done: true, value })
      },
      throw: (reason) => {
        if (done === undefined) done = { kind: 'throw', reason }
        nextTask?.reject(reason)
        void dispose()
        return Promise.resolve({ done: true, value: undefined })
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }

  schedule(label, trigger, disposed = false) {
    let timer
    const dispose = this.ctx.effect(() => () => {
      disposed = true
      globalThis.clearTimeout(timer)
    }, label)
    const wrapper = (...args) => {
      globalThis.clearTimeout(timer)
      timer = trigger(args, disposed)
    }
    wrapper.dispose = dispose
    return wrapper
  }

  throttle(callback, delay, noTrailing) {
    let lastCall = -Infinity
    const execute = (...args) => {
      lastCall = Date.now()
      callback(...args)
    }
    return this.schedule('ctx.throttle()', (args, disposed) => {
      const remaining = delay - Date.now() + lastCall
      if (remaining <= 0) {
        execute(...args)
      } else if (!disposed) {
        return globalThis.setTimeout(execute, remaining, ...args)
      }
    }, noTrailing)
  }

  debounce(callback, delay) {
    return this.schedule('ctx.debounce()', (args, disposed) => {
      if (disposed) return
      return globalThis.setTimeout(callback, delay, ...args)
    })
  }
}

export function provideClientTimer(ctx) {
  new ClientTimerService(ctx)
}
