import { resolveCallLLM } from '../../../src/agent/llm_resolver.js'
import { readLessons, writeLessons, withLessonsLock } from './lessons-store.js'
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

function countFieldCorrections(lessonsContent, field) {
    if (typeof lessonsContent !== 'string') return 0
    const section = lessonsContent.match(/## CORRECTIONS_APPLIED\n([\s\S]*?)(\n## |$)/)
    if (!section) return 0
    return (section[1].match(new RegExp(`\\b${field}\\b`, 'g')) || []).length
}

export async function learn(documentType, corrections, opts = {}) {
    if (!Array.isArray(corrections) || !corrections.length) {
        return { updated: false, reason: 'no corrections supplied' }
    }
    return await withLessonsLock(documentType, async () => {
        const cwd = opts.cwd
        const current = readLessons(documentType, cwd)
        if (current === null) {
            return { updated: false, reason: 'no lessons file exists for document type: ' + documentType }
        }
        const correctionsList = corrections.map(c => `- ${c.field}: was ${JSON.stringify(c.before)}, now ${JSON.stringify(c.after)} (reason: ${c.reason || ''})`).join('\n')
        const prompt = `Current lessons file:\n${untrustedBlock(current)}\n\nHuman corrected these fields on real extracted rows:\n${untrustedBlock(correctionsList)}\n\nRewrite ONLY the "## EXTRACTION_RULES" and "## CORRECTIONS_APPLIED" sections to catch these patterns generally in future extractions (do not overfit to the single corrected value — generalize the rule). Keep every other section byte-identical to the input. Respond with exactly this JSON shape: {"content": string} where content is the FULL updated lessons file text (all sections, not just the two changed ones).`
        const call = resolveCallLLM({ model: opts.model || 'cheap' })
        let parsed = null
        try {
            const res = await call({
                model: opts.model || 'cheap',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 4096,
            })
            parsed = extractJson(res?.content || '')
        } catch (e) {
            return { updated: false, reason: 'learner call failed: ' + (e?.message || String(e)) }
        }
        if (!parsed || typeof parsed.content !== 'string' || !parsed.content.includes('## EXTRACTION_RULES')) {
            return { updated: false, reason: 'malformed or missing JSON response from learner' }
        }
        writeLessons(documentType, parsed.content, cwd)
        const brittleFields = [...new Set(corrections.map(c => c.field))]
            .map(f => ({ field: f, count: countFieldCorrections(parsed.content, f) }))
            .filter(f => f.count >= 5)
        return { updated: true, content: parsed.content, brittleFields }
    })
}
