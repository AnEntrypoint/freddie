const PRICING = {
    'claude-opus-4-7': [15, 75], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5': [0.8, 4],
    'gpt-5': [10, 30], 'gpt-5-mini': [0.25, 2], 'gpt-4o': [2.5, 10], 'gpt-4o-mini': [0.15, 0.6],
    'o3': [15, 60], 'o3-mini': [1.1, 4.4], 'o1': [15, 60],
    'gemini-2.5-pro': [1.25, 10], 'gemini-2.5-flash': [0.075, 0.3],
    'grok-3': [3, 15], 'grok-4': [5, 25], 'deepseek-v3': [0.27, 1.1],
}
export function priceFor(model) {
    if (PRICING[model]) return PRICING[model]
    for (const [k, v] of Object.entries(PRICING)) if (model.startsWith(k)) return v
    return [0, 0]
}
export function calculateCost({ model, prompt_tokens = 0, completion_tokens = 0 }) {
    const [pIn, pOut] = priceFor(model)
    return (prompt_tokens / 1_000_000) * pIn + (completion_tokens / 1_000_000) * pOut
}
