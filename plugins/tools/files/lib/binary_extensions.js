export const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tiff',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.mp3', '.mp4', '.mov', '.avi', '.flac', '.ogg',
    '.ttf', '.otf', '.woff', '.woff2',
    '.wasm', '.class', '.jar',
])
export function isBinary(filename) {
    const lower = String(filename).toLowerCase()
    for (const ext of BINARY_EXTENSIONS) if (lower.endsWith(ext)) return true
    return false
}
