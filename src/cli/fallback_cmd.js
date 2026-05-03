import { resolveCommand, COMMAND_REGISTRY } from '../commands/registry.js'
import { fuzzyMatch } from '../utils.js'
export function suggest(input) {
    const slash = input.replace(/^\//, '').split(/\s+/)[0]
    if (resolveCommand(input)) return null
    const scored = COMMAND_REGISTRY.map(c => ({ name: c.name, score: fuzzyMatch(slash, c.name) })).filter(s => s.score > 0)
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 3).map(s => '/' + s.name)
}
