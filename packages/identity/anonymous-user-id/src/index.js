import { randomUUID } from '@freddie/freddie-runtime/crypto'
import { mkdirSync, readFileSync, writeFileSync } from '@freddie/freddie-runtime/fs'
import { dirname, join } from '@freddie/freddie-runtime/path'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'
import { process } from '@freddie/freddie-runtime/process'

const ANONYMOUS_USER_ID_FILE_NAME = '.anonymous-user-id'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const memo = new Map()

function readPersistedId(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const value = text.trim()
  return UUID_PATTERN.test(value) ? value : undefined
}

function createExclusively(file, id) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${id}\n`, { encoding: 'utf8', flag: 'wx' })
}

function overwriteBestEffort(file, id) {
  try {
    writeFileSync(file, `${id}\n`, 'utf8')
  } catch {}
}

export function getOrCreateAnonymousUserId(options = {}) {
  const file = join(resolveFreddieHome(undefined, options.env ?? process.env), ANONYMOUS_USER_ID_FILE_NAME)
  const cached = memo.get(file)
  if (cached !== undefined) return cached

  let id = readPersistedId(file)
  if (id === undefined) {
    const generate = options.randomUUID ?? randomUUID
    const created = generate()
    try {
      createExclusively(file, created)
      id = created
    } catch {
      id = readPersistedId(file)
      if (id === undefined) {
        overwriteBestEffort(file, created)
        id = created
      }
    }
  }
  memo.set(file, id)
  return id
}
