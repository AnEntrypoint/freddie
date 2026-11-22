import '@freddie/freddie-runtime/install-node'
import { Context } from '../src/index.js'

const ctx = new Context()
const seen = []
const reports = []
ctx.on('probe/event', (a, b) => { seen.push(['plain', a, b]) })
ctx.on('probe/event', () => { throw new Error('sync boom') })
ctx.on('probe/event', async () => { throw new Error('async boom') })
ctx.on('probe/event', (a) => { seen.push(['after', a]) })
ctx.events.emitContained((error, how) => reports.push([how, error.message]), 'probe/event', 1, 2)
await new Promise((resolve) => setTimeout(resolve, 10))
const expected = JSON.stringify({ seen: [['plain', 1, 2], ['after', 1]], reports: [['threw', 'sync boom'], ['rejected', 'async boom']] })
const actual = JSON.stringify({ seen, reports })
if (actual !== expected) throw new Error('emitContained: got ' + actual + ', expected ' + expected)
console.log('cordis emitContained: every listener runs, a sync throw and an async rejection are each reported once')
