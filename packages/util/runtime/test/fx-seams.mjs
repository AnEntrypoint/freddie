import { fxRuntime } from '../src/fx.js'

const expected = ['asyncHooks', 'buffer', 'childProcess', 'crypto', 'dnsPromises', 'fs', 'fsPromises', 'http', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perfHooks', 'process', 'stream', 'stringDecoder', 'timersPromises', 'url', 'util', 'utilTypes', 'vm', 'workerThreads', 'zlib']
const missing = expected.filter((name) => fxRuntime[name] === undefined || fxRuntime[name] === null)
const extra = Object.keys(fxRuntime).filter((name) => !expected.includes(name))
if (missing.length > 0 || extra.length > 0) throw new Error('fx seams: missing ' + JSON.stringify(missing) + ' extra ' + JSON.stringify(extra))
console.log('ok   every node seam resolves to an fx:host module (' + expected.length + ')')
