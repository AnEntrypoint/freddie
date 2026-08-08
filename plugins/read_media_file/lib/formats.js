import path from 'node:path'

// --- Image/video extensions ---
export const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif',
])

export const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.webm', '.mov', '.avi',
])

export const ALL_MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])

// --- MIME map ---
export const MIME_MAP = {
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

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

// --- Workspace boundary ---
export function resolveAndCheck(p, cwd) {
    const resolved = path.resolve(cwd, p)
    const rel = path.relative(cwd, resolved)
    const outside = rel === '' ? false : rel.startsWith('..') || path.isAbsolute(rel)
    if (outside) return { error: `path outside workspace: ${resolved}`, resolved }
    return { resolved }
}
