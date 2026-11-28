import '@freddie/freddie-runtime/install-fx'
import { sessionPersistence } from 'fx:host/session'
import { readFileSync } from '@freddie/freddie-runtime/fs'
import { process } from '@freddie/freddie-runtime/process'

const { meta, batches } = JSON.parse(readFileSync('payload.json', 'utf8'))
const persistence = sessionPersistence({ path: 'sessions.sqlite' })
await persistence.create(meta)
for (const batch of batches) await persistence.append(meta.id, batch)
process.kill(process.pid, 'SIGKILL')
