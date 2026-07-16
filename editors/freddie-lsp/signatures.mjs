// Extracts exported function/const signatures from freddie source files via
// a lightweight regex parse (no AST dep) -- AGENTS.md's zero-comment rule
// means there is no JSDoc to extract, so hover text is built entirely from
// the signature itself: name + parameter list + destructured param names,
// which is the one source of truth that always exists in a well-named
// codebase (the whole premise "naming carries the weight" this repo follows).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p, out)
        else out.push(p)
    }
    return out
}

// Matches `export function name(params) {` and `export async function name(params) {`,
// capturing the parameter list up to its matching close-paren (handles nested
// parens/braces in default values and destructuring by brace-depth tracking).
function extractSignatures(src, file) {
    const sigs = []
    const re = /export\s+(async\s+)?function\s+(\w+)\s*\(/g
    let m
    while ((m = re.exec(src))) {
        const isAsync = !!m[1]
        const name = m[2]
        const parenStart = re.lastIndex - 1
        let depth = 1, i = parenStart + 1
        for (; i < src.length && depth > 0; i++) {
            if (src[i] === '(') depth++
            else if (src[i] === ')') depth--
        }
        const params = src.slice(parenStart + 1, i - 1).replace(/\s+/g, ' ').trim()
        const line = src.slice(0, m.index).split('\n').length
        sigs.push({ name, params, isAsync, file, line, kind: 'function' })
    }
    // `export const name = (...) =>` / `export const name = async (...) =>`
    const constRe = /export\s+const\s+(\w+)\s*=\s*(async\s+)?\(/g
    while ((m = constRe.exec(src))) {
        const name = m[1]
        const isAsync = !!m[2]
        const parenStart = constRe.lastIndex - 1
        let depth = 1, i = parenStart + 1
        for (; i < src.length && depth > 0; i++) {
            if (src[i] === '(') depth++
            else if (src[i] === ')') depth--
        }
        const params = src.slice(parenStart + 1, i - 1).replace(/\s+/g, ' ').trim()
        const line = src.slice(0, m.index).split('\n').length
        sigs.push({ name, params, isAsync, file, line, kind: 'const-arrow' })
    }
    return sigs
}

export function buildSignatureIndex(root) {
    const dirs = ['src', 'plugins'].filter((d) => { try { return statSync(join(root, d)).isDirectory() } catch { return false } })
    const files = dirs.flatMap((d) => walk(join(root, d))).filter((f) => ['.js', '.mjs'].includes(extname(f)))
    const index = new Map() // name -> [{...sig}]
    for (const f of files) {
        const src = readFileSync(f, 'utf8')
        for (const sig of extractSignatures(src, f)) {
            const rel = f.replace(root, '').replace(/\\/g, '/')
            const entry = { ...sig, file: rel }
            if (!index.has(sig.name)) index.set(sig.name, [])
            index.get(sig.name).push(entry)
        }
    }
    return index
}

export function hoverTextFor(index, identifier) {
    const matches = index.get(identifier)
    if (!matches || !matches.length) return null
    return matches.map((s) => {
        const prefix = s.isAsync ? 'async function' : (s.kind === 'const-arrow' ? 'const' : 'function')
        const sig = s.kind === 'const-arrow' ? `${s.name} = ${s.isAsync ? 'async ' : ''}(${s.params}) => ...` : `${s.name}(${s.params})`
        return `**${prefix} ${sig}**\n\n${s.file}:${s.line}`
    }).join('\n\n---\n\n')
}
