import '@freddie/freddie-runtime-node/install-node'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from '@freddie/freddie-runtime/fs'
import { spawnSync } from '@freddie/freddie-runtime/child-process'
import { tmpdir } from '@freddie/freddie-runtime/os'
import { join } from '@freddie/freddie-runtime/path'
import { process } from '@freddie/freddie-runtime/process'
import { runConformance } from '@freddie/freddie-session-persistence/src/conformance.js'
import { JsonlSessionPersistence } from '../src/index.js'

const TORN_BYTES = 12
const CHILD = new URL('./conformance-child.js', import.meta.url).pathname

async function newStorage() {
  const root = mkdtempSync(join(tmpdir(), 'conformance-jsonl-'))
  return {
    open: async (ctx) => {
      const persistence = new JsonlSessionPersistence(ctx, { root, compression: 'none', packChunks: false, writeBatchMaxDelayMs: 1 })
      return {
        persistence,
        abandon: async () => rmSync(join(root, '.writer.lock'), { force: true }),
        tearTail: async (meta) => {
          const path = persistence.locate(meta).path
          const bytes = readFileSync(path)
          writeFileSync(path, bytes.subarray(0, bytes.length - TORN_BYTES))
        },
      }
    },
    crashAfterAppend: async (meta, batches) => {
      const child = spawnSync(process.execPath, [CHILD, root, JSON.stringify({ meta, batches })], { encoding: 'utf8' })
      if (child.signal !== 'SIGKILL') throw new Error(`the child was meant to die by SIGKILL right after the append, got ${child.signal ?? child.status}: ${child.stderr}`)
      rmSync(join(root, '.writer.lock'), { force: true })
    },
    cleanup: async () => rmSync(root, { recursive: true, force: true }),
  }
}

await runConformance({ name: 'jsonl', newStorage })
