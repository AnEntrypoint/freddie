const CALLS = 'sharp(data, { failOn, limitInputPixels }) with metadata(), clone(), rotate(), toColourspace("srgb"), resize({ width, height, fit: "inside", withoutEnlargement, kernel, fastShrinkOnLoad }), raw(), png({ compressionLevel, palette }), jpeg({ quality }), webp({ quality }) and toBuffer({ resolveWithObject }), plus sharp.kernel.nearest'

export function imageOverFx(module) {
  if (typeof module?.sharp === 'function') return module
  const sharp = () => {
    throw new Error(`fx:host has no image module: the attachment seam needs ${CALLS}`)
  }
  sharp.kernel = { nearest: 'nearest' }
  return { sharp }
}
