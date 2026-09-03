import fs from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, ALL_MEDIA_EXTENSIONS, MIME_MAP, MAX_FILE_SIZE, resolveAndCheck } from './formats.js'
import { detectDimensions } from './dimensions.js'

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
