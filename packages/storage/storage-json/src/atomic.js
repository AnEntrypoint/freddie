import { open, rename, rm } from '@freddie/freddie-runtime/fs-promises'
import { dirname, join } from '@freddie/freddie-runtime/path'
import { randomUUID } from '@freddie/freddie-runtime/crypto'
import { process } from '@freddie/freddie-runtime/process'

export async function writeAtomic(path, data) {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    const handle = await open(tmp, 'wx', 0o600)
    try {
      await handle.writeFile(data, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, path)
    await fsyncDirectory(dirname(path))
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

async function fsyncDirectory(path) {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
