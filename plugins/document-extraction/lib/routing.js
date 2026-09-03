export function routeByConfidence(rows, confidence, thresholds = { high: 0.85, medium: 0.5 }) {
    const high = [], medium = [], low = []
    for (let i = 0; i < rows.length; i++) {
        const c = confidence[i] ?? 0
        const bucket = c >= thresholds.high ? high : c >= thresholds.medium ? medium : low
        bucket.push({ ...rows[i], confidence: c })
    }
    const lessonsIncomplete = rows.length > 0 && low.length / rows.length > 0.3
    return { high, medium, low, lessonsIncomplete }
}
