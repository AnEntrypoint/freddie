
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import {
  AttachmentError,
  AttachmentId,
} from '@freddie/freddie-attachment'
import { normalizeImage } from './normalization.js'
import { detectImage, probeImage } from './image.js'

const ID_PATTERN = /^sha256:([a-f0-9]{64})$/
const durableHomes = new Set()

function digest(data) {
  return createHash('sha256').update(data).digest('hex')
}

function displayName(value) {
  if (value === undefined) return undefined
  const leaf = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1)
  const clean = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255)
  return clean === '' ? undefined : clean
}

function objectPath(root, sha256) {
  return join(root, 'objects', sha256.slice(0, 2), sha256)
}

function ensureReference(ref) {
  const match = ID_PATTERN.exec(String(ref.attachmentId))
  if (match?.[1] === undefined) throw new AttachmentError('Attachment reference is invalid.', 'INVALID_ATTACHMENT_REF')
  return match[1]
}

async function inspectMetadata(data, declaredMediaType, limits) {
  if (data.byteLength === 0) throw new AttachmentError('Image is empty.', 'INVALID_IMAGE')
  const detected = await detectImage(data, { maxPixels: limits.maxImagePixels, maxDimension: limits.maxImageDimension })
  if (detected.mediaType !== declaredMediaType) throw new AttachmentError('Declared image type does not match its bytes.', 'IMAGE_TYPE_MISMATCH')
  return detected
}

export async function validateImageFile(input, limits, policy) {
  await prepareImageFile(input, limits, policy)
}

export async function prepareImageFile(input, limits, policy) {
  if (input.data.byteLength > limits.maxImageBytes) {
    throw new AttachmentError('Image exceeds the configured byte limit.', 'IMAGE_TOO_LARGE')
  }
  const detected = await inspectMetadata(input.data, input.mediaType, limits)
  const normalized = await normalizeImage(input.data, detected, policy)
  const sha256 = digest(normalized.data)
  const name = displayName(input.name)
  const downscaled = detected.width !== normalized.width || detected.height !== normalized.height
  return {
    data: normalized.data,
    ref: {
      attachmentId: AttachmentId(`sha256:${sha256}`),
      mediaType: normalized.mediaType,
      width: normalized.width,
      height: normalized.height,
      bytes: normalized.data.byteLength,
      ...(name !== undefined ? { name } : {}),
      ...downscaled ? { originalDimensions: { width: detected.width, height: detected.height } } : {},
    },
  }
}

async function syncDirectory(path) {
  if (process.platform === 'win32') return
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function ensureDurableDirectory(path, boundary) {
  const target = resolve(path)
  const stop = resolve(boundary)
  await mkdir(target, { recursive: true, mode: 0o700 })
  await chmod(target, 0o700)
  let level = target
  while (level !== stop) {
    const parent = dirname(level)
    await syncDirectory(parent)
    if (parent === level) return
    level = parent
  }
}

async function ensureDurableHome(path) {
  const home = resolve(path)
  if (!durableHomes.has(home)) {
    await ensureDurableDirectory(home, parse(home).root)
    durableHomes.add(home)
  }
  return home
}

export async function commitPreparedImageFile(root, prepared) {
  const normalized = prepared.data
  const sha256 = ensureReference(prepared.ref)
  if (digest(normalized) !== sha256 || normalized.byteLength !== prepared.ref.bytes) {
    throw new AttachmentError('Prepared attachment bytes do not match their reference.', 'ATTACHMENT_CORRUPT')
  }
  const bucket = join(root, 'objects', sha256.slice(0, 2))
  const staging = join(root, 'tmp')
  const boundary = await ensureDurableHome(dirname(dirname(resolve(root))))
  await ensureDurableDirectory(bucket, boundary)
  await ensureDurableDirectory(staging, boundary)
  const temporary = join(staging, randomUUID())
  const target = objectPath(root, sha256)
  let handle
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await handle.writeFile(normalized)
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await link(temporary, target)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      const existing = new Uint8Array(await readFile(target))
      if (digest(existing) !== sha256) throw new AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT')
    }
    await syncDirectory(bucket)
    await syncDirectory(join(root, 'objects'))
    await unlink(temporary)
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(
      () => {},
    )
    await unlink(temporary).catch(
      (cleanupError) => {
        if (!(cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'ENOENT')) throw cleanupError
      },
    )
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unable to persist image attachment.', 'ATTACHMENT_WRITE_FAILED', { cause: error })
  }
  return prepared.ref
}

export async function saveImageFile(root, input, limits, policy) {
  return commitPreparedImageFile(root, await prepareImageFile(input, limits, policy))
}

export async function readImageFile(root, ref, signal) {
  signal?.throwIfAborted()
  const sha256 = ensureReference(ref)
  let data
  try {
    data = new Uint8Array(await readFile(objectPath(root, sha256), { signal }))
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new AttachmentError('Attachment object is missing.', 'ATTACHMENT_NOT_FOUND')
    throw new AttachmentError('Unable to read image attachment.', 'ATTACHMENT_READ_FAILED', { cause: error })
  }
  signal?.throwIfAborted()
  if (digest(data) !== sha256) throw new AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT')
  const metadata = await probeImage(data)
  signal?.throwIfAborted()
  if (metadata.mediaType !== ref.mediaType || data.byteLength !== ref.bytes
    || metadata.width !== ref.width || metadata.height !== ref.height) {
    throw new AttachmentError('Stored attachment metadata does not match its reference.', 'ATTACHMENT_CORRUPT')
  }
  return { ref, data }
}
