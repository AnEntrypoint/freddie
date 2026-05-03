const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]

export function parseCron(expr) {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) throw new Error(`cron must have 5 fields: ${expr}`)
    return parts.map((p, i) => parseField(p, RANGES[i][0], RANGES[i][1]))
}

function parseField(p, lo, hi) {
    const out = new Set()
    for (const piece of p.split(',')) {
        let step = 1, range = piece
        if (piece.includes('/')) { const [r, s] = piece.split('/'); range = r; step = Number(s) }
        let from = lo, to = hi
        if (range !== '*') {
            if (range.includes('-')) { const [a, b] = range.split('-'); from = Number(a); to = Number(b) }
            else { from = to = Number(range) }
        }
        for (let v = from; v <= to; v += step) out.add(v)
    }
    return out
}

export function matches(parsed, date) {
    const fields = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()]
    return parsed.every((set, i) => set.has(fields[i]))
}
