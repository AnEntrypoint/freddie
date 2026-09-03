import fs from 'node:fs'
import crypto from 'node:crypto'
import { webFetch, extractText } from '../../tools/web/lib/fetch.js'
import { callLLM } from '../../../src/agent/acptoapi-bridge.js'

function hashOf(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalize(text) {
    return { text, contentHash: hashOf(text) }
}

async function loadText(content) {
    return normalize(String(content))
}

async function loadHtml(content) {
    return normalize(extractText(String(content)))
}

async function loadUrl(url) {
    const r = await webFetch({ url, parse: 'text' })
    if (!r.ok) return { error: r.error, url }
    if (typeof r.content !== 'string') return { error: 'webFetch returned no content', url }
    return normalize(r.content)
}

async function loadFilePath(filePath) {
    if (!fs.existsSync(filePath)) return { error: `not found: ${filePath}` }
    const raw = fs.readFileSync(filePath, 'utf8')
    return normalize(raw)
}

async function loadImage(content, prompt = 'Extract all visible text and structured content from this image.') {
    const messages = [{
        role: 'user',
        content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: content } },
        ],
    }]
    try {
        const r = await callLLM({ messages, model: 'openai/gpt-4o-mini' })
        return normalize(r.content || '')
    } catch (e) {
        return { error: 'vision call failed: ' + (e?.message || String(e)) }
    }
}

export async function loadDocument({ type, content, url, filePath, prompt } = {}) {
    if (type === 'text') return loadText(content)
    if (type === 'html') return loadHtml(content)
    if (type === 'url') return loadUrl(url || content)
    if (type === 'file') return loadFilePath(filePath || content)
    if (type === 'image') return loadImage(content, prompt)
    return { error: `unsupported document type: ${type}. PDF-native extraction is not supported for v1 -- route PDFs through type:'image' (vision path).` }
}

export const SUPPORTED_TYPES = ['text', 'html', 'url', 'file', 'image']
