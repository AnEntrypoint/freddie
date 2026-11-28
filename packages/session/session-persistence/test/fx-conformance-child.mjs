import '@freddie/freddie-runtime/install-fx'
import { sessionPersistence } from 'fx:host/session'
import { process } from '@freddie/freddie-runtime/process'

const [path, payload] = process.argv.slice(2)
const { meta, batches } = JSON.parse(payload)
const persistence = sessionPersistence({ path })
await persistence.create(meta)
for (const batch of batches) await persistence.append(meta.id, batch)
process.kill(process.pid, 'SIGKILL')
