
import { Buffer } from 'node:buffer'
import { AttachmentError } from './error.js'

function decodeBase64(data) {
  const decoded = Buffer.from(data, 'base64')
  if (data.length === 0 || decoded.toString('base64') !== data) {
    throw new AttachmentError('Image upload is not canonical base64.', 'INVALID_IMAGE_BASE64')
  }
  return new Uint8Array(decoded)
}

function saveInput(image) {
  return {
    data: decodeBase64(image.data),
    mediaType: image.mediaType,
    ...image.name === undefined ? {} : { name: image.name },
  }
}

export async function admitEncodedImages(attachments, images) {
  return attachments.saveImages(images.map(saveInput))
}
