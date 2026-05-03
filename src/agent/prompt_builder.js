import { SUMMARY_PREFIX } from './compress/index.js'
export function buildSystemPrompt({ persona = '', skills = [], context = [], cacheBreakpoint = true } = {}) {
    const parts = []
    if (persona) parts.push(persona)
    if (skills.length) parts.push('## Available skills\n' + skills.map(s => '- ' + s.name + ': ' + (s.description || '')).join('\n'))
    if (context.length) parts.push('## Context\n' + context.map(c => '[' + c.name + ']\n' + c.body).join('\n\n'))
    return { content: parts.join('\n\n'), cacheBreakpoint }
}
export function injectSummaryHandoff(messages, summary) {
    if (!summary) return messages
    return [...messages, { role: 'user', content: SUMMARY_PREFIX + '\n\n' + summary }]
}
