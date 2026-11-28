import '@freddie/freddie-runtime-node/install-node'
import { Context } from '@freddie/cordis'
import { SessionStore } from '@freddie/freddie-session'
import { process } from '@freddie/freddie-runtime/process'
import { JsonlSessionPersistence } from '../src/index.js'

const [root, payload] = process.argv.slice(2)
const { meta, batches } = JSON.parse(payload)
const ctx = new Context()
new SessionStore(ctx)
const persistence = new JsonlSessionPersistence(ctx, { root, compression: 'none', packChunks: false, writeBatchMaxDelayMs: 1 })
await persistence.create(meta)
for (const batch of batches) await persistence.append(meta.id, batch)
process.kill(process.pid, 'SIGKILL')
