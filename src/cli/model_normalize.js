const ALIASES = {
    sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7', haiku: 'claude-haiku-4-5',
    gpt5: 'gpt-5', gpt5mini: 'gpt-5-mini', '4o': 'gpt-4o', '4omini': 'gpt-4o-mini',
    flash: 'gemini-2.5-flash', pro: 'gemini-2.5-pro',
    grok: 'grok-4', llama: 'llama-3.3-70b', dsv3: 'deepseek-v3',
}
export function normalizeModel(input) {
    if (!input) return null
    const lower = String(input).trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    return ALIASES[lower] || input
}
export function listAliases() { return { ...ALIASES } }
