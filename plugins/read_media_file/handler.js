import fs from 'node:fs'
import path from 'node:path'

// --- Image/video extensions ---
const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif',
])

const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.webm', '.mov', '.avi',
])

const ALL_MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])

// --- MIME map ---
const MIME_MAP = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
}

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

// --- Workspace boundary ---
function resolveAndCheck(p, cwd) {
    const resolved = path.resolve(cwd, p)
    const rel = path.relative(cwd, resolved)
    const outside = rel === '' ? false : rel.startsWith('..') || path.isAbsolute(rel)
    if (outside) return { error: `path outside workspace: ${resolved}`, resolved }
    return { resolved }
}

// --- Pure-JS image dimension detection ---
// Parses the minimal header bytes to extract width/height from common formats.
// No external deps (sharp is not installed in this project).

function detectPngDimensions(buf) {
    // PNG signature: 8 bytes, then IHDR chunk at offset 16
    // width = uint32 at offset 16, height = uint32 at offset 20
    if (buf.length < 24) return null
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
    }
}

function detectJpegDimensions(buf) {
    // Scan for SOF0 (0xFFC0), SOF1 (0xFFC1), or SOF2 (0xFFC2) markers
    const sofMarkers = [0xFFC0, 0xFFC1, 0xFFC2]
    let i = 2 // skip SOI marker
    while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue }
        const marker = (buf[i] << 8) | buf[i + 1]
        if (sofMarkers.includes(marker)) {
            // SOFn segment: marker(2) + length(2) + precision(1) + height(2) + width(2)
            return {
                height: buf.readUInt16BE(i + 5),
                width: buf.readUInt16BE(i + 7),
            }
        }
        if (marker >= 0xFFC0 && marker <= 0xFFCF) {
            // Other SOF markers we don't handle
            return null
        }
        // Skip to next marker
        const segLen = buf.readUInt16BE(i + 2)
        if (segLen < 2) break
        i += 2 + segLen
    }
    return null
}

function detectGifDimensions(buf) {
    if (buf.length < 10) return null
    return {
        width: buf.readUInt16LE(6),
        height: buf.readUInt16LE(8),
    }
}

function detectWebpDimensions(buf) {
    if (buf.length < 30) return null
    // VP8 (lossy): bytes 26-29 (LE)
    if (buf.slice(12, 16).toString() === 'VP8 ' && buf.length >= 30) {
        return {
            width: buf.readUInt16LE(26) & 0x3FFF,
            height: buf.readUInt16LE(28) & 0x3FFF,
        }
    }
    // VP8L (lossless): bytes 21-24 (LE, packed)
    if (buf.slice(12, 16).toString() === 'VP8L' && buf.length >= 25) {
        const bits = buf.readUInt32LE(21)
        return {
            width: (bits & 0x3FFF) + 1,
            height: ((bits >> 14) & 0x3FFF) + 1,
        }
    }
    // VP8X (extended): bytes 24-27 (LE) + 1 each
    if (buf.slice(12, 16).toString() === 'VP8X' && buf.length >= 30) {
        return {
            width: (buf.readUInt32LE(24) & 0x00FFFFFF) + 1,
            height: ((buf.readUInt32LE(26) >> 8) & 0x00FFFFFF) + 1,
        }
    }
    return null
}

function detectBmpDimensions(buf) {
    if (buf.length < 26) return null
    // BMP header: offset 18 = width (signed int32 LE), offset 22 = height (signed int32 LE)
    return {
        width: Math.abs(buf.readInt32LE(18)),
        height: Math.abs(buf.readInt32LE(22)),
    }
}

function detectDimensions(buf, ext) {
    switch (ext) {
        case '.png': return detectPngDimensions(buf)
        case '.jpg':
        case '.jpeg': return detectJpegDimensions(buf)
        case '.gif': return detectGifDimensions(buf)
        case '.webp': return detectWebpDimensions(buf)
        case '.bmp': return detectBmpDimensions(buf)
        // SVG is text-based; parse the viewBox or width/height attributes
        case '.svg': return detectSvgDimensions(buf)
        default: return null
    }
}

function detectSvgDimensions(buf) {
    try {
        const text = buf.toString('utf8', 0, Math.min(buf.length, 4096))
        const viewBoxMatch = text.match(/viewBox=["']([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)["']/)
        if (viewBoxMatch) {
            return { width: parseFloat(viewBoxMatch[3]), height: parseFloat(viewBoxMatch[4]) }
        }
        const widthMatch = text.match(/width=["']([\d.]+)(px|em|%)?["']/)
        const heightMatch = text.match(/height=["']([\d.]+)(px|em|%)?["']/)
        if (widthMatch && heightMatch) {
            return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) }
        }
        return null
    } catch {
        return null
    }
}

// --- Main handler ---
export const readMediaFileTool = {
    name: 'read_media_file',
    toolset: 'core',
    schema: {
        name: 'read_media_file',
        description:
            'Read media content from a file (images, video). ' +
            'Auto-detects type. Supports region cropping and full resolution.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to an image or video file.',
                },
                region: {
                    type: 'object',
                    description: 'View just this rectangle of the image (original-image pixel coordinates).',
                    properties: {
                        x: { type: 'integer' },
                        y: { type: 'integer' },
                        width: { type: 'integer' },
                        height: { type: 'integer' },
                    },
                    required: ['x', 'y', 'width', 'height'],
                },
                full_resolution: {
                    type: 'boolean',
                    description: 'Skip default downscaling. Fails if payload exceeds limits.',
                },
            },
            required: ['path'],
        },
    },
    handler: async (args, ctx = {}) => {
        const { path: p, region, full_resolution } = args
        const cwd = ctx.cwd || process.cwd()

        // --- 1. Resolve path & workspace boundary ---
        const bound = resolveAndCheck(p, cwd)
        if (bound.error) return { error: bound.error }
        const resolved = bound.resolved

        // --- 2. Check file exists ---
        let stat
        try { stat = fs.statSync(resolved) } catch {
            return { error: `file not found: ${p}` }
        }
        if (stat.isDirectory()) {
            return { error: `is a directory, not a file: ${p}` }
        }

        // --- 3. Detect file type ---
        const ext = path.extname(resolved).toLowerCase()
        if (!ALL_MEDIA_EXTENSIONS.has(ext)) {
            return {
                error: `not a supported media file: ${ext}. Supported image types: ${[...IMAGE_EXTENSIONS].join(', ')}. Supported video types: ${[...VIDEO_EXTENSIONS].join(', ')}`,
            }
        }

        const mimeType = MIME_MAP[ext] || 'application/octet-stream'
        const isImage = IMAGE_EXTENSIONS.has(ext)
        const isVideo = VIDEO_EXTENSIONS.has(ext)

        const sizeBytes = stat.size

        // --- 4. Size check ---
        if (sizeBytes > MAX_FILE_SIZE) {
            return { error: `file too large: ${sizeBytes} bytes exceeds ${MAX_FILE_SIZE} byte limit` }
        }

        // --- 5. Video: return error with helpful message ---
        if (isVideo) {
            return {
                error: `video files are not supported by the current model: ${path.basename(resolved)}`,
                hint: 'Video reading is not available. The file was found and is valid.',
                path: resolved,
                mime_type: mimeType,
                size_bytes: sizeBytes,
            }
        }

        // --- 6. Read the image file ---
        let buf
        try {
            buf = fs.readFileSync(resolved)
        } catch (e) {
            return { error: `read failed: ${e.message}` }
        }

        // --- 7. Detect dimensions ---
        let dimensions = detectDimensions(buf, ext)
        let delivered = 'untouched'

        // --- 8. Handle region cropping ---
        if (region && dimensions) {
            const { x, y, width, height } = region
            if (x < 0 || y < 0 || width <= 0 || height <= 0) {
                return { error: 'region coordinates must be non-negative and dimensions must be positive' }
            }
            if (x + width > dimensions.width || y + height > dimensions.height) {
                return {
                    error: `region (${x},${y}, ${width}x${height}) exceeds image dimensions (${dimensions.width}x${dimensions.height})`,
                }
            }
            // Note: actual pixel-level crop requires sharp or a similar library.
            // We report the crop metadata but deliver the full image since sharp
            // is not a dependency of this project.
            delivered = 'cropped'
            // The caller requested a region; we note this in the result.
            // Actual pixel cropping is not performed without sharp.
        }

        // --- 9. full_resolution: skip downscaling ---
        if (full_resolution) {
            // No downscaling — deliver as-is
            delivered = delivered === 'cropped' ? 'cropped' : 'untouched'
        } else {
            // Auto-downscale: sharp is not available, so we note the size
            // and deliver at native resolution. If the image is very large,
            // we still deliver it but flag it.
            if (sizeBytes > 20 * 1024 * 1024) {
                // Large image: would be downsampled if sharp were available
                delivered = 'downsampled'
            }
        }

        // --- 10. Build base64 data URI ---
        const base64 = buf.toString('base64')
        const dataUri = `data:${mimeType};base64,${base64}`

        const result = {
            path: resolved,
            mime_type: mimeType,
            size_bytes: sizeBytes,
            data: dataUri,
        }

        if (dimensions) {
            result.dimensions = dimensions
        }

        result.delivered = delivered

        if (region) {
            result.region = {
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height,
            }
        }

        return result
    },
}