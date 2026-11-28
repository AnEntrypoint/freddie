import '../src/install-fx.js'
import host from 'fx:host'
import { ptyOverFx } from '../src/fx-pty.js'

const check = (condition, message) => {
  if (!condition) throw new Error(message)
}

const calls = []
const written = []
let dataListener
let finish
const fake = {
  open: (options) => {
    calls.push(options)
    return {
      pid: 4242,
      write: text => written.push(text),
      resize: (cols, rows) => calls.push({ resize: [cols, rows] }),
      kill: signal => calls.push({ kill: signal }),
      onData: (listener) => { dataListener = listener; return () => { dataListener = undefined } },
      exited: new Promise((resolve) => { finish = resolve }),
    }
  },
}

const terminal = ptyOverFx(fake).spawn('bash', ['-l'], { cwd: '/w', env: { A: '1' }, cols: 100, rows: 30 })
check(terminal.pid === 4242, 'pid comes from fx')
same(calls[0], { cmd: 'bash', args: ['-l'], cwd: '/w', env: { A: '1' }, cols: 100, rows: 30 }, 'open options')
terminal.write('ls\n')
terminal.resize(120, 40)
terminal.kill('SIGTERM')
check(written[0] === 'ls\n', 'write is forwarded')
same(calls.slice(1), [{ resize: [120, 40] }, { kill: 'SIGTERM' }], 'resize and kill are forwarded')
const seen = []
const subscription = terminal.onData(chunk => seen.push(chunk))
dataListener('a')
subscription.dispose()
check(dataListener === undefined, 'disposing the subscription unsubscribes from fx')
const exits = []
terminal.onExit(result => exits.push(result))
finish({ exitCode: 3, signal: 0 })
await Promise.resolve()
await Promise.resolve()
same(exits, [{ exitCode: 3, signal: 0 }], 'exit result')
console.log('ok   the adapter maps the planned fx pty.open contract onto the node-pty terminal shape')

let refusal
try {
  ptyOverFx(host.modules.pty).spawn('sh', [], {})
} catch (error) {
  refusal = error.message
}
console.log(refusal === undefined
  ? 'ok   fx:host pty has open(): the real module accepted the spawn'
  : `ok   fx:host pty has no open(), the adapter says so: ${refusal}`)

function same(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: got ${JSON.stringify(actual)}`)
}
