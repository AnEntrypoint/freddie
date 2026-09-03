import { getConfigValue } from '../../src/config.js'
import { logger } from '../../src/observability/log.js'

const log = logger('tool_output_limits')
const HEAP_SHRINK_THRESHOLD_PCT = 80
const HEAP_SHRINK_FACTOR = 0.5

// Shrinks the configured output cap when the process is under real memory
// pressure — a large tool result held in memory while heap usage is already
// high raises the odds of an OOM. Ratio is checked live (not cached) since
// heap usage changes turn to turn.
function dynamicLimit(base) {
    const mem = process.memoryUsage()
    const pct = (mem.heapUsed / mem.heapTotal) * 100
    if (pct < HEAP_SHRINK_THRESHOLD_PCT) return base
    const shrunk = Math.floor(base * HEAP_SHRINK_FACTOR)
    log.warn('dynamic output limit shrink: heap usage crossed threshold', { heap_pct: Math.round(pct), base_limit: base, shrunk_limit: shrunk })
    return shrunk
}

export function truncate(s, max = null) {
    const base = max ?? getConfigValue('tool.output_limit', 100_000)
    const limit = dynamicLimit(base)
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
