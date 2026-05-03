import { paste } from './clipboard.js'
const HEAVY_THRESHOLD = 4000
export async function clawIntoMessage({ minLength = 50 } = {}) {
    const text = (await paste()) || ''
    if (text.length < minLength) return null
    const trimmed = text.length > HEAVY_THRESHOLD ? text.slice(0, HEAVY_THRESHOLD) + '\n…[' + (text.length - HEAVY_THRESHOLD) + ' chars truncated]' : text
    return { content: '[pasted]\n\n' + trimmed, originalLength: text.length, truncated: text.length > HEAVY_THRESHOLD }
}
