import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { load, dump } from 'js-yaml'

export const METADATA_FILE = 'preset.yml'

function text(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export async function readPresetMetadata(directory) {
  let raw
  try {
    raw = await readFile(join(directory, METADATA_FILE), 'utf8')
  } catch {
    return {}
  }
  let parsed
  try {
    parsed = load(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const record = parsed
  const name = text(record.name)
  const description = text(record.description)
  const order = typeof record.order === 'number' && Number.isFinite(record.order)
    ? record.order
    : undefined
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
  }
}

export function renderPresetMetadata(metadata) {
  const name = text(metadata.name)
  const description = text(metadata.description)
  const { order } = metadata
  if (name === undefined && description === undefined && order === undefined) return undefined
  return dump({
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...order === undefined ? {} : { order },
  }, { lineWidth: -1 })
}
