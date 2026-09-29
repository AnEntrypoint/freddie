
import sharp from 'sharp'
import { AttachmentError } from '@freddie/freddie-attachment'

export function encodedAlphaIsCompatible(sourceHasAlpha, output) {
  return sourceHasAlpha === undefined
    || output.hasAlpha === sourceHasAlpha
    || (sourceHasAlpha && !output.hasAlpha && output.mediaType === 'image/webp')
}

const MEDIA_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function carriesRetainedMetadata(metadata) {
  return metadata.exif !== undefined
    || metadata.xmp !== undefined
    || metadata.iptc !== undefined
    || metadata.icc !== undefined
    || metadata.hasProfile
    || metadata.tifftagPhotoshop !== undefined
    || metadata.comments !== undefined
    || metadata.orientation !== undefined
}

async function imageMetadata(image) {
  const metadata = await image.metadata()
  const mediaType = MEDIA_TYPES[metadata.format]
  if (mediaType === undefined) {
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE')
  }
  const transposed = metadata.orientation !== undefined && metadata.orientation >= 5
  return {
    mediaType,
    width: transposed ? metadata.height : metadata.width,
    height: transposed ? metadata.width : metadata.height,
    animated: (metadata.pages ?? 1) > 1,
    carriesMetadata: carriesRetainedMetadata(metadata),
    depth: metadata.depth,
    space: metadata.space,
    hasAlpha: metadata.hasAlpha,
  }
}

export async function probeImage(data) {
  try {
    return await imageMetadata(sharp(data, { failOn: 'error', limitInputPixels: false }))
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

export async function detectImage(data, limits) {
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    const detected = await imageMetadata(image)
    if (limits?.maxPixels !== undefined && detected.width * detected.height > limits.maxPixels) {
      throw new AttachmentError('Image exceeds the configured decoded-pixel limit.', 'IMAGE_TOO_MANY_PIXELS')
    }
    if (limits?.maxDimension !== undefined && Math.max(detected.width, detected.height) > limits.maxDimension) {
      throw new AttachmentError('Image exceeds the configured per-side pixel limit.', 'IMAGE_DIMENSION_TOO_LARGE')
    }
    await image.raw().toBuffer()
    return detected
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}
