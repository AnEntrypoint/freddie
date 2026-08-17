import fs from 'node:fs'
import path from 'node:path'

function lessonsDir(cwd = process.cwd()) {
    return path.join(cwd, '.gm-lessons')
}

function slugify(documentType) {
    return String(documentType).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function lessonPath(documentType, cwd = process.cwd()) {
    return path.join(lessonsDir(cwd), `${slugify(documentType)}.md`)
}

export function readLessons(documentType, cwd = process.cwd()) {
    const p = lessonPath(documentType, cwd)
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf8')
}

export function writeLessons(documentType, content, cwd = process.cwd()) {
    const dir = lessonsDir(cwd)
    fs.mkdirSync(dir, { recursive: true })
    const target = lessonPath(documentType, cwd)
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, content, 'utf8')
    fs.renameSync(tmp, target)
}

export function listLessonTypes(cwd = process.cwd()) {
    const dir = lessonsDir(cwd)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
}

const locks = new Map()

export async function withLessonsLock(documentType, fn) {
    const key = slugify(documentType)
    const prior = locks.get(key) || Promise.resolve()
    let release
    const gate = new Promise(r => { release = r })
    locks.set(key, prior.then(() => gate))
    await prior
    try {
        return await fn()
    } finally {
        release()
        if (locks.get(key) === gate) locks.delete(key)
    }
}
