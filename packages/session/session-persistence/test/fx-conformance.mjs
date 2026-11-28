import '@freddie/freddie-runtime/install-fx'
import host from 'fx:host'
import { sessionPersistence } from 'fx:host/session'
import { mkdtempSync, rmSync, writeFileSync } from '@freddie/freddie-runtime/fs'
import { spawnSync } from '@freddie/freddie-runtime/child-process'
import { tmpdir } from '@freddie/freddie-runtime/os'
import { join } from '@freddie/freddie-runtime/path'
import { process } from '@freddie/freddie-runtime/process'
import { runConformance } from '../src/conformance.js'

const CHILD = new URL('./fx-conformance-child.mjs', import.meta.url).pathname

async function newStorage() {
  const root = mkdtempSync(join(tmpdir(), 'conformance-fx-'))
  const path = join(root, 'sessions.sqlite')
  return {
    open: async () => {
      const persistence = sessionPersistence({ path })
      return {
        persistence,
        abandon: async () => {},
        tearTail: async (meta) => {
          const db = host.modules.sqlite.open(path)
          db.exec(`UPDATE events SET data = substr(data, 1, length(data) / 2) WHERE id = '${meta.id}' AND seq = (SELECT MAX(seq) FROM events WHERE id = '${meta.id}')`)
          db.close()
        },
      }
    },
    crashAfterAppend: async (meta, batches) => {
      writeFileSync(join(root, 'payload.json'), JSON.stringify({ meta, batches }))
      const child = spawnSync(process.argv[0], ['js', '--permission-mode', 'yolo', CHILD], { cwd: root, encoding: 'utf8' })
      const killed = child.signal === 'SIGKILL' || child.signal === 9
      if (!killed) throw new Error(`the child was meant to die by SIGKILL right after the append, got ${child.signal ?? child.status}: ${child.stderr}`)
    },
    cleanup: async () => rmSync(root, { recursive: true, force: true }),
  }
}

await runConformance({ name: 'fx', newStorage })
