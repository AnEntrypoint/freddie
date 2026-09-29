
import { join, resolve } from 'node:path'
import z from '@freddie/schemastery'
import { AttachmentStore } from '@freddie/freddie-attachment'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'
import { CompressionLimiter } from './compression-limiter.js'
import { commitPreparedImageFile, prepareImageFile, readImageFile, validateImageFile } from './store.js'
import { readRequestImageFile, requestImageVariantId } from './request-image.js'

export { canPassThroughNormalization, normalizeImage } from './normalization.js'
export { commitPreparedImageFile, prepareImageFile, readImageFile, saveImageFile, validateImageFile } from './store.js'
export { readRequestImageFile, requestImageDimensions, requestImageVariantId } from './request-image.js'

export const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const DEFAULT_MAX_IMAGES_PER_MESSAGE = 20
export const DEFAULT_MAX_MESSAGE_IMAGE_BYTES = 200 * 1024 * 1024
export const DEFAULT_MAX_IMAGE_PIXELS = 64_000_000
export const DEFAULT_MAX_IMAGE_DIMENSION = 8192
export const DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION = 2048
export const DEFAULT_NORMALIZED_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export const DEFAULT_IMAGE_COMPRESSION_CONCURRENCY = 2
export const MAX_IMAGE_COMPRESSION_CONCURRENCY = 8

function abortReason(signal) {
  const reason = signal.reason
  return reason instanceof Error
    ? reason
    : new Error('Attachment request cancelled with a non-Error reason.', { cause: reason })
}

class SharedRequest {
  controller = new AbortController()
  settled = false
  waiters = 0

  constructor(start) {
    this.promise = start(this.controller.signal).finally(() => {
      this.settled = true
    })
  }

  wait(signal) {
    signal?.throwIfAborted()
    this.waiters += 1
    if (signal === undefined) {
      return this.promise.finally(() => {
        this.release(false)
      })
    }
    let released = false
    const release = (cancelled) => {
      if (released) return
      released = true
      this.release(cancelled, signal)
    }
    return new Promise((resolve, reject) => {
      const abort = () => {
        release(true)
        reject(abortReason(signal))
      }
      signal.addEventListener('abort', abort, { once: true })
      void this.promise.then((value) => {
        signal.removeEventListener('abort', abort)
        release(false)
        resolve(value)
      }, (error) => {
        signal.removeEventListener('abort', abort)
        release(false)
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors
        reject(error)
      })
    })
  }

  release(cancelled, signal) {
    this.waiters -= 1
    if (cancelled && this.waiters === 0 && !this.settled && signal !== undefined) {
      this.controller.abort(abortReason(signal))
    }
  }
}

export class LocalAttachmentStore extends AttachmentStore {
  static Config = z.object({
    freddieHome: z.string(),
    maxImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_IMAGE_BYTES),
    maxImagesPerMessage: z.number().step(1).min(1).default(DEFAULT_MAX_IMAGES_PER_MESSAGE),
    maxMessageImageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_IMAGE_BYTES),
    maxImagePixels: z.number().step(1).min(1).default(DEFAULT_MAX_IMAGE_PIXELS),
    maxImageDimension: z.number().step(1).min(1).default(DEFAULT_MAX_IMAGE_DIMENSION),
    normalizedImageMaxDimension: z.number().step(1).min(1).default(DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION),
    normalizedImageMaxBytes: z.number().step(1).min(1).default(DEFAULT_NORMALIZED_IMAGE_MAX_BYTES),
    imageCompressionConcurrency: z.number().step(1).min(1).max(MAX_IMAGE_COMPRESSION_CONCURRENCY)
      .default(DEFAULT_IMAGE_COMPRESSION_CONCURRENCY),
  })

  requestInflight = new Map()

  constructor(ctx, config) {
    super(ctx)
    this.root = resolve(join(resolveFreddieHome(config.freddieHome), 'attachments', 'v1'))
    this.imageLimits = Object.freeze({
      maxImageBytes: config.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
      maxImagesPerMessage: config.maxImagesPerMessage ?? DEFAULT_MAX_IMAGES_PER_MESSAGE,
      maxMessageImageBytes: config.maxMessageImageBytes ?? DEFAULT_MAX_MESSAGE_IMAGE_BYTES,
      maxImagePixels: config.maxImagePixels ?? DEFAULT_MAX_IMAGE_PIXELS,
      maxImageDimension: config.maxImageDimension ?? DEFAULT_MAX_IMAGE_DIMENSION,
      mediaTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    })
    this.normalizationPolicy = Object.freeze({
      maxDimension: config.normalizedImageMaxDimension ?? DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION,
      maxBytes: config.normalizedImageMaxBytes ?? DEFAULT_NORMALIZED_IMAGE_MAX_BYTES,
    })
    const compressionConcurrency = config.imageCompressionConcurrency ?? DEFAULT_IMAGE_COMPRESSION_CONCURRENCY
    if (!Number.isSafeInteger(compressionConcurrency)
      || compressionConcurrency < 1
      || compressionConcurrency > MAX_IMAGE_COMPRESSION_CONCURRENCY) {
      throw new Error(
        `attachment-local: imageCompressionConcurrency must be an integer from 1 through ${MAX_IMAGE_COMPRESSION_CONCURRENCY}`,
      )
    }
    this.imageCompressionConcurrency = compressionConcurrency
    this.compression = new CompressionLimiter(compressionConcurrency)
  }

  async validateImage(input) {
    await this.compression.run(() => validateImageFile(input, this.imageLimits, this.normalizationPolicy))
  }

  async saveImages(inputs) {
    this.validateImageBatch(inputs)
    const prepared = await Promise.all(inputs.map(input => this.compression.run(
      () => prepareImageFile(input, this.imageLimits, this.normalizationPolicy),
    )))
    const refs = []
    for (const image of prepared) refs.push(await commitPreparedImageFile(this.root, image))
    return refs
  }

  async saveImage(input) {
    const prepared = await this.compression.run(
      () => prepareImageFile(input, this.imageLimits, this.normalizationPolicy),
    )
    return commitPreparedImageFile(this.root, prepared)
  }

  async readImage(ref, signal) {
    return readImageFile(this.root, ref, signal)
  }

  async readImageRequest(ref, policy, signal) {
    return this.requestVersion(ref, policy, undefined, signal)
  }

  requestVersion(ref, policy, stored, signal) {
    signal?.throwIfAborted()
    const variantId = requestImageVariantId(ref, policy)
    const key = String(variantId)
    let operation = this.requestInflight.get(key)
    if (operation?.controller.signal.aborted) {
      this.requestInflight.delete(key)
      operation = undefined
    }
    if (operation === undefined) {
      const shared = new SharedRequest(sharedSignal => this.compression.run(async () => readRequestImageFile(
        this.root,
        stored ?? await this.readImage(ref, sharedSignal),
        policy,
        sharedSignal,
      )))
      operation = shared
      this.requestInflight.set(key, shared)
      void shared.promise.finally(() => {
        if (this.requestInflight.get(key) === shared) this.requestInflight.delete(key)
      }).catch(() => {})
    }
    return operation.wait(signal)
  }

}

export default LocalAttachmentStore
