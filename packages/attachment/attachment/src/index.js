
import { Service } from '@freddie/cordis'
import { AttachmentError } from './error.js'

export { AttachmentId, ImageVariantId } from './brand.js'
export { AttachmentError, isImageAdmissionError } from './error.js'
export { admitEncodedImages } from './admission.js'

export class AttachmentStore extends Service {
  constructor(ctx) {
    super(ctx, 'attachments')
  }

  imageLimits

  validateImage(input) {
    throw new Error('Not implemented: subclasses must implement validateImage')
  }

  validateImageBatch(inputs) {
    const { maxImagesPerMessage, maxMessageImageBytes, mediaTypes } = this.imageLimits
    if (inputs.length > maxImagesPerMessage) {
      throw new AttachmentError('Image batch exceeds the configured image-count limit.', 'TOO_MANY_IMAGES')
    }
    const totalBytes = inputs.reduce((sum, input) => sum + input.data.byteLength, 0)
    if (totalBytes > maxMessageImageBytes) {
      throw new AttachmentError('Image batch exceeds the configured aggregate image-byte limit.', 'IMAGES_TOO_LARGE')
    }
    for (const input of inputs) {
      if (!mediaTypes.includes(input.mediaType)) {
        throw new AttachmentError(`Image type ${input.mediaType} is not accepted by this deployment.`, 'UNSUPPORTED_IMAGE_TYPE')
      }
    }
  }

  async saveImages(inputs) {
    this.validateImageBatch(inputs)
    for (const input of inputs) await this.validateImage(input)

    const refs = []
    for (const input of inputs) refs.push(await this.saveImage(input))
    return refs
  }

  saveImage(input) {
    throw new Error('Not implemented: subclasses must implement saveImage')
  }

  readImage(ref, signal) {
    throw new Error('Not implemented: subclasses must implement readImage')
  }

  readImageRequest(ref, policy, signal) {
    signal?.throwIfAborted()
    void ref
    void policy
    return Promise.reject(new AttachmentError(
      'The mounted attachment provider cannot derive model-request images.',
      'ATTACHMENT_PROJECTION_UNSUPPORTED',
    ))
  }

}

export default AttachmentStore
