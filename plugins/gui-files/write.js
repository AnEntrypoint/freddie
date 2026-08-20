import path from 'node:path'
import fs from 'node:fs'
import { resolveAllowedPath } from './lib.js'

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
        // `name` is untrusted request input. Strip any directory component so
        // it can only ever name a file inside the already-validated dirPath —
        // path.join(dirPath, name) below would otherwise let a name like
        // '../../../etc/whatever' escape the allowlisted project tree.
        const safeName = path.basename(String(name))
        if (!safeName || safeName === '.' || safeName === '..') return res.status(400).json({ error: 'invalid name' })
        let dirPath = resolveAllowedPath(targetPath)
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            // targetPath is a directory — save file into it
        } else {
            dirPath = path.dirname(dirPath)
        }
        const dest = resolveAllowedPath(path.join(dirPath, safeName))
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
