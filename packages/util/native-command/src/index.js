import { execFile } from 'node:child_process'

export const runNativeCommand = (command, args, signal) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = Object.assign(new Error(error.message, { cause: error }), {
            code: error.code,
            stdout,
            stderr,
          })
          reject(failure)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
