// Blank markers in flow node/edge labels: {{name}} or {{name:hint}}
// Filled only when the owning node is visited (see FlowRunner).

const BLANK_TOKEN = /\{\{\s*([A-Za-z_][\w]*)(?::([^}]*))?\s*\}\}/
const BLANK_GLOBAL = new RegExp(BLANK_TOKEN.source, 'g')
const BLANK_TAG = /<blank\s+name=["']?([A-Za-z_][\w]*)["']?\s*>([\s\S]*?)<\/blank>/gi

function extractBlanks(text) {
    const out = []
    const seen = new Set()
    if (!text) return out
    const re = new RegExp(BLANK_TOKEN.source, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
        if (seen.has(m[1])) continue
        seen.add(m[1])
        out.push({ name: m[1], hint: (m[2] || '').trim() })
    }
    return out
}

function protectBlanks(content) {
    const saved = []
    const out = String(content || '').replace(BLANK_GLOBAL, (m) => {
        saved.push(m)
        return `\0BLANK${saved.length - 1}\0`
    })
    return { out, saved }
}

function restoreBlanks(text, saved) {
    if (!text || !saved || !saved.length) return text || ''
    return String(text).replace(/\0BLANK(\d+)\0/g, (_, i) => saved[Number(i)] ?? _)
}

function substituteBlanks(text, filled) {
    if (!text) return ''
    if (!filled) return text
    return String(text).replace(BLANK_GLOBAL, (m, name) => {
        if (Object.prototype.hasOwnProperty.call(filled, name) && filled[name] != null) {
            return String(filled[name])
        }
        return m
    })
}

function parseBlankTags(content) {
    const out = {}
    if (!content) return out
    const re = new RegExp(BLANK_TAG.source, 'gi')
    let m
    while ((m = re.exec(content)) !== null) {
        out[m[1]] = m[2].trim()
    }
    return out
}

export { extractBlanks, protectBlanks, restoreBlanks, substituteBlanks, parseBlankTags }
