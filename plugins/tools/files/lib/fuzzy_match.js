import { fuzzyMatch } from '../../../../src/utils.js'

export { fuzzyMatch }

// Finds the closest matching line in `haystackText` for `needle`, used by the
// edit tool to produce a helpful suggestion when an exact old_string match fails.
export function findClosestLine(needle, haystackText) {
    const lines = String(haystackText).split('\n')
    let best = null, bestScore = 0
    for (let i = 0; i < lines.length; i++) {
        const score = fuzzyMatch(needle, lines[i])
        if (score > bestScore) { bestScore = score; best = { line: i + 1, text: lines[i] } }
    }
    return bestScore > 0 ? { ...best, score: bestScore } : null
}
