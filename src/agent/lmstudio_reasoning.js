export function extractReasoning(content) {
    const tags = [/<think>([\s\S]*?)<\/think>/g, /<reasoning>([\s\S]*?)<\/reasoning>/g]
    const reasoning = []
    let cleaned = String(content || '')
    for (const re of tags) {
        for (const m of cleaned.matchAll(re)) reasoning.push(m[1])
        cleaned = cleaned.replace(re, '')
    }
    return { reasoning: reasoning.join('\n').trim(), content: cleaned.trim() }
}
export function isLmStudio(provider, baseUrl) {
    return provider === 'lmstudio' || /(^|\.)lmstudio\.|:1234\b|:8000\b/.test(String(baseUrl || ''))
}
