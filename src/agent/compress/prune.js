export const PRUNED_TOOL_PLACEHOLDER = '[Old tool output cleared to save context space]'

export function pruneOldToolResults(messages, keepLast = 5) {
    const toolIndices = []
    messages.forEach((m, i) => { if (m.role === 'tool') toolIndices.push(i) })
    const keepFromIndex = toolIndices.length > keepLast ? toolIndices[toolIndices.length - keepLast] : -1
    return messages.map((m, i) => {
        if (m.role !== 'tool') return m
        if (i >= keepFromIndex) return m
        return { ...m, content: PRUNED_TOOL_PLACEHOLDER }
    })
}

export function countToolMessages(messages) {
    return messages.filter(m => m.role === 'tool').length
}
