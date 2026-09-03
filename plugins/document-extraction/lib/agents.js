import { resolveCallLLM } from '../../../src/agent/llm_resolver.js'
import { untrustedBlock, SYSTEM_PROMPT } from './prompt-safety.js'

function extractJson(text) {
    if (typeof text !== 'string') return null
    const trimmed = text.trim()
    const outerStart = trimmed.indexOf('{')
    const fenceStart = trimmed.search(/```(?:json)?\s*\{/i)
    const useFence = fenceStart !== -1 && (outerStart === -1 || fenceStart < outerStart)
    const candidate = useFence ? trimmed.slice(trimmed.indexOf('{', fenceStart)) : trimmed
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end < start) return null
    try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
}

function clampConfidence(n) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    return Math.max(0, Math.min(1, v))
}

async function callJson(prompt, { model = 'cheap', maxTokens = 2048 } = {}) {
    const call = resolveCallLLM({ model })
    const res = await call({
        model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
    })
    return { text: res?.content || '', parsed: extractJson(res?.content || '') }
}

export async function classify(documentSample, knownDocumentTypes = [], opts = {}) {
    const typesList = Array.isArray(knownDocumentTypes) && knownDocumentTypes.length
        ? knownDocumentTypes.join(', ')
        : '(none known yet — this may be a NEW document type)'
    const prompt = `Known document lesson types: ${typesList}\n\nClassify this document sample against the known types, or propose "NEW" if it matches none well.\n\nDocument sample:\n${untrustedBlock(String(documentSample || '').slice(0, 4000))}\n\nRespond with exactly this JSON shape: {"documentType": string, "confidence": number between 0 and 1, "reason": string}`
    try {
        const { parsed } = await callJson(prompt, opts)
        if (!parsed || typeof parsed.documentType !== 'string') {
            return { documentType: null, confidence: 0, reason: 'malformed or missing JSON response from classifier', rejected: true }
        }
        return {
            documentType: parsed.documentType,
            confidence: clampConfidence(parsed.confidence),
            reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        }
    } catch (e) {
        return { documentType: null, confidence: 0, reason: 'classifier call failed: ' + (e?.message || String(e)), rejected: true }
    }
}

export async function extract(documentText, lessonsContent, targetSchema, opts = {}) {
    const schemaDesc = Object.entries(targetSchema || {}).map(([k, v]) => `${k}: ${v}`).join(', ')
    const prompt = `Lessons/extraction rules for this document type:\n${lessonsContent || '(no lessons file yet — extract using best judgement)'}\n\nTarget schema (field: type): ${schemaDesc || '(none supplied — infer fields from the document)'}\n\nDocument text:\n${untrustedBlock(String(documentText || '').slice(0, 8000))}\n\nExtract structured rows matching the schema. Respond with exactly this JSON shape: {"rows": [ {field: value, ...}, ... ], "confidence": [number between 0 and 1, one per row, same order and length as rows], "extractorReason": string}`
    try {
        const { parsed } = await callJson(prompt, opts)
        if (!parsed || !Array.isArray(parsed.rows)) {
            return { rows: [], confidence: [], extractorReason: 'malformed or missing JSON response from extractor', rejected: true }
        }
        const rows = parsed.rows
        let confidence = Array.isArray(parsed.confidence) ? parsed.confidence.map(clampConfidence) : []
        if (confidence.length < rows.length) confidence = confidence.concat(Array(rows.length - confidence.length).fill(0))
        if (confidence.length > rows.length) confidence = confidence.slice(0, rows.length)
        return {
            rows,
            confidence,
            extractorReason: typeof parsed.extractorReason === 'string' ? parsed.extractorReason : '',
        }
    } catch (e) {
        return { rows: [], confidence: [], extractorReason: 'extractor call failed: ' + (e?.message || String(e)), rejected: true }
    }
}

const LESSONS_SECTIONS = ['DOCUMENT_TYPE', 'SOURCE_URL', 'DISCOVERY_NOTES', 'EXTRACTION_RULES', 'FIELD_DEFINITIONS', 'OUTPUT_SCHEMA', 'KNOWN_EDGE_CASES', 'CORRECTIONS_APPLIED']

function fallbackLessonsContent(documentSample, desiredFields) {
    const fields = Array.isArray(desiredFields) ? desiredFields : []
    return LESSONS_SECTIONS.map(s => {
        if (s === 'DOCUMENT_TYPE') return `## ${s}\nUNKNOWN`
        if (s === 'FIELD_DEFINITIONS') return `## ${s}\n${fields.map(f => `- ${f}: unknown`).join('\n') || '(none proposed)'}`
        if (s === 'DISCOVERY_NOTES') return `## ${s}\nDiscovery LLM call returned malformed JSON; this is a fallback stub.`
        return `## ${s}\n(unset)`
    }).join('\n\n')
}

export async function discover(documentSample, desiredFields = [], opts = {}) {
    const fieldsList = Array.isArray(desiredFields) && desiredFields.length ? desiredFields.join(', ') : '(none specified — infer likely fields from the sample)'
    const sectionsList = LESSONS_SECTIONS.map(s => `## ${s}`).join('\n')
    const prompt = `This document sample does not match any known lesson type. Propose a full lessons-file template for it.\n\nDesired fields: ${fieldsList}\n\nDocument sample:\n${untrustedBlock(String(documentSample || '').slice(0, 4000))}\n\nThe lessons file content MUST contain exactly these section headers, each as a markdown "## " heading, in this order, each with real substantive content under it (not placeholders):\n${sectionsList}\n\nRespond with exactly this JSON shape: {"documentType": string, "content": string}\nThe "content" value is the full lessons file text described above, with every newline inside it escaped as \\n so the overall response is valid single-line JSON. Output nothing but the JSON object.`
    try {
        const { parsed } = await callJson(prompt, { maxTokens: 4096, ...opts })
        const hasAllSections = s => typeof s === 'string' && LESSONS_SECTIONS.every(h => s.includes(h))
        if (parsed && typeof parsed.documentType === 'string' && hasAllSections(parsed.content)) {
            return { documentType: parsed.documentType, content: parsed.content }
        }
        return {
            documentType: (parsed && typeof parsed.documentType === 'string' && parsed.documentType) || 'UNKNOWN',
            content: fallbackLessonsContent(documentSample, desiredFields),
            rejected: true,
        }
    } catch (e) {
        return { documentType: 'UNKNOWN', content: fallbackLessonsContent(documentSample, desiredFields), rejected: true, reason: 'discovery call failed: ' + (e?.message || String(e)) }
    }
}
