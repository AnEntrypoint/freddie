export function compressTrajectory({ messages = [], maxKeep = 20 } = {}) {
    if (messages.length <= maxKeep * 2) return { compressed: messages, removed: 0 }
    const head = messages.slice(0, maxKeep)
    const tail = messages.slice(-maxKeep)
    const middleCount = messages.length - head.length - tail.length
    const summary = { role: 'system', content: `[trajectory.compressed] ${middleCount} middle messages elided` }
    return { compressed: [...head, summary, ...tail], removed: middleCount }
}
export function expandTrajectory(trajectory) { return trajectory.compressed }
