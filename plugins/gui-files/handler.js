import path from 'node:path'
import fs from 'node:fs'
import { listProjects, getActiveProject } from '../../src/projects.js'

// Resolve and validate a path against registered project directories.
// Falls back to the active project when no explicit path is supplied.
function resolveAllowedPath(p) {
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
function buildTree(dirPath, depth = 0) {
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
function fileType(name) {
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

function annotateTypes(entries) {
    for (const e of entries) {
        if (e.type !== 'dir') e.type = fileType(e.name)
        if (e.children) annotateTypes(e.children)
    }
    return entries
}

function isTextFile(name) {
    const ext = path.extname(name).toLowerCase()
    const binary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.pdf', '.exe', '.dll', '.so', '.dylib', '.wasm', '.class', '.o', '.obj', '.bin']
    return !binary.includes(ext)
}

function isImageFile(name) {
    const ext = path.extname(name).toLowerCase()
    return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)
}

export async function listFiles(req, res) {
    try {
        const dirPath = resolveAllowedPath(req.query.path)
        const st = fs.statSync(dirPath)
        if (!st.isDirectory()) return res.status(400).json({ error: 'path is not a directory' })
        const tree = annotateTypes(buildTree(dirPath))
        res.json({ path: dirPath, tree })
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}

export async function readFile(req, res) {
    try {
        const filePath = resolveAllowedPath(req.query.path)
        const st = fs.statSync(filePath)
        if (st.isDirectory()) return res.status(400).json({ error: 'path is a directory' })
        const name = path.basename(filePath)
        const maxSize = 2 * 1024 * 1024 // 2 MB
        if (st.size > maxSize) return res.status(400).json({ error: 'file too large (max 2 MB)' })
        const buf = fs.readFileSync(filePath)
        if (isImageFile(name)) {
            const b64 = buf.toString('base64')
            const ext = path.extname(name).toLowerCase()
            const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp' }
            res.json({ path: filePath, content: `data:${mimeMap[ext] || 'image/png'};base64,${b64}`, type: 'image', size: st.size })
        } else if (isTextFile(name)) {
            const text = buf.toString('utf-8')
            const truncated = text.length > 200000
            const content = truncated ? text.slice(0, 200000) : text
            res.json({ path: filePath, content, type: 'text', size: st.size, truncated })
        } else {
            res.json({ path: filePath, content: null, type: 'binary', size: st.size, binary: true })
        }
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}

export async function writeFile(req, res) {
    try {
        const filePath = resolveAllowedPath(req.query.path)
        const { content } = req.body || {}
        if (content == null) return res.status(400).json({ error: 'content is required' })
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        res.json({ ok: true, path: filePath })
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}

export async function deleteFile(req, res) {
    try {
        const filePath = resolveAllowedPath(req.query.path)
        const st = fs.statSync(filePath)
        if (st.isDirectory()) fs.rmSync(filePath, { recursive: true })
        else fs.unlinkSync(filePath)
        res.json({ ok: true, path: filePath })
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}

export async function moveFile(req, res) {
    try {
        const { from, to } = req.body || {}
        if (!from || !to) return res.status(400).json({ error: 'from and to are required' })
        const fromPath = resolveAllowedPath(from)
        const toPath = resolveAllowedPath(to)
        const toDir = path.dirname(toPath)
        if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true })
        fs.renameSync(fromPath, toPath)
        res.json({ ok: true, from: fromPath, to: toPath })
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}

export async function uploadFile(req, res) {
    try {
        // Express multipart handling — req.body is parsed by express.json() first,
        // but multipart uploads need a different parser. For simplicity, accept
        // base64-encoded file content in JSON body.
        const { path: targetPath, content, name } = req.body || {}
        if (!content || !name) return res.status(400).json({ error: 'name and content are required' })
        let dirPath = resolveAllowedPath(targetPath)
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            // targetPath is a directory — save file into it
        } else {
            dirPath = path.dirname(dirPath)
        }
        const dest = path.join(dirPath, name)
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
        // content can be a data URL or raw base64
        let buf
        if (content.startsWith('data:')) {
            const b64 = content.split(',')[1] || ''
            buf = Buffer.from(b64, 'base64')
        } else {
            buf = Buffer.from(content, 'base64')
        }
        fs.writeFileSync(dest, buf)
        res.json({ ok: true, path: dest })
    } catch (e) {
        res.status(400).json({ error: e.message })
    }
}