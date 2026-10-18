import { randomBytes } from 'node:crypto'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeFileAtomic(filename, content, options) {
  await mkdir(dirname(filename), {
    recursive: true,
    ...options.dirMode === undefined ? {} : { mode: options.dirMode },
  })
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { mode: options.mode, flag: 'wx' })
    await rename(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function isLockContention(error, lockPath) {
  const code = error?.code
  if (code === 'EEXIST') return true
  if (code !== 'EPERM') return false
  try {
    await lstat(lockPath)
    return true
  } catch {
    return false
  }
}

const LOCK_RETRY_INITIAL_MS = 20
const LOCK_RETRY_MAX_MS = 200

const DEFAULT_LOCK_WAIT_MS = 2_000


export async function withFileLock(filename, operation, options) {
  const lockPath = `${filename}.lock`
  const deadline = Date.now() + (options?.waitMs ?? DEFAULT_LOCK_WAIT_MS)
  let delay = LOCK_RETRY_INITIAL_MS
  for (;;) {
    try {
      await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600, flag: 'wx' })
      break
    } catch (error) {
      if (!await isLockContention(error, lockPath)) throw error
    }
    if (Date.now() >= deadline) {
      throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`)
    }
    await new Promise(resolve => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS)
  }
  try {
    return await operation()
  } finally {
    await rm(lockPath, { force: true })
  }
}
