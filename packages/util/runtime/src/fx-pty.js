const MISSING_OPEN = 'fx:host pty has no open(options): the terminal seam needs pty.open({ cmd, args, cwd, env, cols, rows }) returning { pid, write(text), onData(listener), resize(cols, rows), kill(signal), exited }'

export function ptyOverFx(module) {
  return {
    spawn(file, args = [], options = {}) {
      if (typeof module?.open !== 'function') throw new Error(MISSING_OPEN)
      const terminal = module.open({ cmd: file, args, cwd: options.cwd, env: options.env, cols: options.cols, rows: options.rows })
      return {
        pid: terminal.pid,
        write: text => terminal.write(text),
        resize: (cols, rows) => terminal.resize(cols, rows),
        kill: signal => terminal.kill(signal),
        onData: listener => ({ dispose: terminal.onData(listener) ?? (() => {}) }),
        onExit: (listener) => {
          let live = true
          terminal.exited.then(result => { if (live) listener(result) })
          return { dispose: () => { live = false } }
        },
      }
    },
  }
}
