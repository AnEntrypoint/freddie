export const CODEX_MODELS = ['o3', 'o3-mini', 'o1', 'o1-mini', 'gpt-5', 'gpt-5-mini']
export function isCodexModel(id) {
    if (!id) return false
    return CODEX_MODELS.some(m => id === m || id.startsWith(m))
}
export function recommendCodexModel(scenario) {
    return ({ reasoning: 'o3', fast: 'o3-mini', flagship: 'gpt-5', cheap: 'gpt-5-mini' })[scenario] || 'o3-mini'
}
