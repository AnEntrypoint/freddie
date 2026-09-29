import { open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

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

/* v8 ignore start -- Windows rejects O_RDONLY directory opens; POSIX coverage exercises this. */
async function fsyncDirectory(path) {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
/* v8 ignore stop */
