import fs from 'node:fs'
import path from 'node:path'

const ACTIONS = {
    move: ({ src, dest }) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(src, dest); return { moved: dest } },
    copy: ({ src, dest }) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); return { copied: dest } },
    delete: ({ path: p }) => { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); return { deleted: p } },
    mkdir: ({ path: p }) => { fs.mkdirSync(p, { recursive: true }); return { created: p } },
    stat: ({ path: p }) => { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() } },
}

export const fileOperationsTool = ({
    name: 'file_operations',
    toolset: 'core',
    schema: { name: 'file_operations', description: 'move/copy/delete/mkdir/stat — atomic file ops.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, src: { type: 'string' }, dest: { type: 'string' }, path: { type: 'string' } }, required: ['action'] } },
    handler: async (a) => { const fn = ACTIONS[a.action]; try { return fn ? fn(a) : { error: 'unknown action' } } catch (e) { return { error: String(e.message || e) } } },
})
