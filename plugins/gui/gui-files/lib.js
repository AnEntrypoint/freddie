import path from 'node:path'
import fs from 'node:fs'
import { listProjects, getActiveProject } from '../../../src/projects.js'

// Resolve and validate a path against registered project directories.
// Falls back to the active project when no explicit path is supplied.
export function resolveAllowedPath(p) {
    const projects = listProjects()
    if (!p) {
        const active = getActiveProject()
        if (!active) throw new Error('no active project')
        return path.resolve(active.path)
    }
    const requested = path.resolve(String(p))
    for (const proj of projects) {
        const base = path.resolve(proj.path)
        if (requested === base || requested.startsWith(base + path.sep)) return requested
    }
    throw new Error('path not in an allowlisted project directory')
}

// Build a recursive directory tree: { name, type:'dir'|'file', size, modified, children? }
export function buildTree(dirPath, depth = 0) {
    const entries = []
    try {
        const names = fs.readdirSync(dirPath)
        names.sort((a, b) => {
            const aIsDir = fs.statSync(path.join(dirPath, a)).isDirectory()
            const bIsDir = fs.statSync(path.join(dirPath, b)).isDirectory()
            if (aIsDir && !bIsDir) return -1
            if (!aIsDir && bIsDir) return 1
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        })
        for (const name of names) {
            const full = path.join(dirPath, name)
            try {
                const st = fs.statSync(full)
                const entry = {
                    name,
                    type: st.isDirectory() ? 'dir' : 'file',
                    size: st.isDirectory() ? null : st.size,
                    modified: st.mtime.toISOString(),
                }
                if (st.isDirectory() && depth < 3) {
                    // Auto-expand only the first level; deeper levels are lazy-loaded
                    if (depth === 0) {
                        entry.children = buildTree(full, depth + 1)
                    }
                }
                entries.push(entry)
            } catch { /* skip unreadable entries */ }
        }
    } catch { /* skip unreadable directories */ }
    return entries
}

// Map file extension to a broad type category for the frontend FileIcon.
export function fileType(name) {
    if (!name) return 'other'
    const ext = path.extname(name).toLowerCase()
    const img = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']
    const video = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
    const audio = ['.mp3', '.wav', '.ogg', '.flac', '.aac']
    const code = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.yaml', '.yml', '.xml', '.sh', '.bash', '.toml', '.ini', '.cfg', '.env', '.md', '.sql', '.graphql', '.php', '.swift', '.kt', '.scala', '.cs', '.lua', '.r', '.m', '.mm', '.pl', '.pm', '.vim', '.vimrc', '.zsh', '.fish', '.dockerfile', '.makefile']
    const archive = ['.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar']
    const doc = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp']
    if (img.includes(ext)) return 'image'
    if (video.includes(ext)) return 'video'
    if (audio.includes(ext)) return 'audio'
    if (code.includes(ext)) return 'code'
    if (archive.includes(ext)) return 'archive'
    if (doc.includes(ext)) return 'document'
    return 'text'
}

export function annotateTypes(entries) {
    for (const e of entries) {
        if (e.type !== 'dir') e.type = fileType(e.name)
        if (e.children) annotateTypes(e.children)
    }
    return entries
}

export function isTextFile(name) {
    const ext = path.extname(name).toLowerCase()
    const binary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.pdf', '.exe', '.dll', '.so', '.dylib', '.wasm', '.class', '.o', '.obj', '.bin']
    return !binary.includes(ext)
}

export function isImageFile(name) {
    const ext = path.extname(name).toLowerCase()
    return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)
}
