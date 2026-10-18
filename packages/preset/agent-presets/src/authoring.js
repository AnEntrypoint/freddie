import { chmod, cp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { writeFileAtomic } from '@freddie/freddie-atomic-write'
import { expandHomePath } from '@freddie/freddie-home-paths'
import { METADATA_FILE, renderPresetMetadata } from './metadata.js'
import { PRESET_ID } from './preset.js'

export class InvalidPresetIdError extends Error {
  constructor(
    presetId,
  ) {
    super(
      `agent-presets: preset id ${JSON.stringify(presetId)} must match ${String(PRESET_ID)} — `
      + 'the id is a directory name, so anything else could escape the preset root',
    )
    this.presetId = presetId
  }
}

export class PresetExistsError extends Error {
  constructor(
    presetId,
  ) {
    super(
      `agent-presets: preset "${presetId}" already exists — `
      + 'a copy never overwrites; delete the existing preset first or choose another id',
    )
    this.presetId = presetId
  }
}

export class PresetNotWritableError extends Error {
  constructor(
    presetId,
    reason,
  ) {
    super(`agent-presets: preset "${presetId}" cannot be written: ${reason}`)
    this.presetId = presetId
  }
}

export function writableRoot(roots) {
  const root = roots.find(candidate => candidate.trust === 'user')
  if (root === undefined) {
    throw new PresetNotWritableError('', 'this deployment configures no user-writable preset root')
  }
  return resolve(expandHomePath(root.path))
}

export async function readComposition(preset) {
  return await readFile(preset.path, 'utf8')
}

async function occupied(path) {
  let present = true
  try {
    await stat(path)
  } catch {
    present = false
  }
  return present
}

async function tightenModes(dir) {
  await chmod(dir, 0o700)
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name)
    if (entry.isDirectory()) {
      await tightenModes(target)
    } else {
      await chmod(target, ((await stat(target)).mode & 0o100) === 0 ? 0o600 : 0o700)
    }
  }
}

export async function copyComposition(
  roots,
  source,
  id,
  name,
) {
  if (!PRESET_ID.test(id)) throw new InvalidPresetIdError(id)
  const dir = join(writableRoot(roots), id)
  if (await occupied(dir)) throw new PresetExistsError(id)
  try {
    await cp(dirname(source.path), dir, {
      recursive: true, dereference: true, force: false, errorOnExist: true,
    })
    await tightenModes(dir)
    const rendered = renderPresetMetadata({
      ...name === undefined ? {} : { name },
      ...source.description === undefined ? {} : { description: source.description },
    })
    const metadataPath = join(dir, METADATA_FILE)
    if (rendered === undefined) {
      await rm(metadataPath, { force: true })
    } else {
      await writeFileAtomic(metadataPath, rendered, { mode: 0o600, dirMode: 0o700 })
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

export async function deleteComposition(
  roots,
  preset,
) {
  if (preset.trust !== 'user') {
    throw new PresetNotWritableError(preset.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), preset.id)
  if (!isAbsolute(preset.path) || !preset.path.startsWith(dir)) {
    throw new PresetNotWritableError(preset.id, 'it does not live under the writable preset root')
  }
  await rm(dir, { recursive: true, force: true })
}
