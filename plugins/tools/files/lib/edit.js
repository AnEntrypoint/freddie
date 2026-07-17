import fs from 'node:fs'
import path from 'node:path'
import { findClosestLine } from './fuzzy_match.js'
import { applyUnifiedDiff } from './patch_parser.js'

export const editTool = ({
    name: 'edit',
    toolset: 'core',
    schema: {
        name: 'edit',
        description: 'Replace exact string in file (or apply a unified diff). Fails if old_string occurs zero or multiple times unless replace_all; on a zero-match miss, returns a fuzzy-matched suggestion for the closest line.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                old_string: { type: 'string' },
                new_string: { type: 'string' },
                replace_all: { type: 'boolean', default: false },
                diff: { type: 'string', description: 'Unified diff to apply instead of old_string/new_string.' },
            },
            required: ['path'],
        },
    },
    handler: async ({ path: p, old_string, new_string, replace_all = false, diff }, ctx = {}) => {
        const resolved = ctx.cwd && p && !path.isAbsolute(p) ? path.join(ctx.cwd, p) : p

        // diff mode: delegate straight to the shared patch_parser lib module.
        if (diff) return { results: applyUnifiedDiff(diff, { cwd: ctx.cwd || process.cwd() }) }

        if (!fs.existsSync(resolved)) return { error: `not found: ${resolved}` }
        const src = fs.readFileSync(resolved, 'utf8')
        const occurrences = src.split(old_string).length - 1
        if (occurrences === 0) {
            const suggestion = findClosestLine(old_string, src)
            return suggestion
                ? { error: 'old_string not found', suggestion: `closest match at line ${suggestion.line}: ${suggestion.text}` }
                : { error: 'old_string not found' }
        }
        if (occurrences > 1 && !replace_all) return { error: `old_string matches ${occurrences} times; pass replace_all=true` }
        const out = replace_all ? src.split(old_string).join(new_string) : src.replace(old_string, new_string)
        fs.writeFileSync(resolved, out, 'utf8')
        return { path: resolved, replacements: replace_all ? occurrences : 1 }
    },
})
