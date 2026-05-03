import { getConfigValue } from '../../src/config.js'

export function truncate(s, max = null) {
    const limit = max ?? getConfigValue('tool.output_limit', 100_000)
    const t = String(s)
    if (t.length <= limit) return t
    return t.slice(0, limit) + `\n…[truncated ${t.length - limit} chars]`
}
export const _tool = ({
    name: 'tool_output_limits',
    toolset: 'core',
    schema: { name: 'tool_output_limits', description: 'Apply the configured output truncation cap to a string.', parameters: { type: 'object', properties: { text: { type: 'string' }, max: { type: 'number' } }, required: ['text'] } },
    handler: async ({ text, max }) => ({ text: truncate(text, max) }),
})
