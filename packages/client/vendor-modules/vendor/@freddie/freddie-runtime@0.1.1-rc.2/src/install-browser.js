import { installRuntime } from './runtime.js'

const unavailable = (name) => () => {
  throw new Error('@freddie/freddie-runtime: ' + name + ' is not available in the browser')
}

installRuntime({
  buffer: { Buffer: globalThis.Buffer, constants: {} },
  module: { createRequire: unavailable('createRequire'), stripTypeScriptTypes: unavailable('stripTypeScriptTypes') },
  process: { env: {}, execArgv: [], platform: 'browser', versions: { node: '0.0.0' } },
})
