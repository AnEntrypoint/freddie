import { installRuntime } from '../src/runtime.js'
import { fxRuntime } from '../src/fx.js'

installRuntime(fxRuntime)
const { runParity } = await import('./parity-cases.js')
await runParity('fx', false)
