import path from 'node:path'
import fs from 'node:fs'
import { resolveAllowedPath, buildTree, annotateTypes, isTextFile, isImageFile } from './lib.js'

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
