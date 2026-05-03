import { db } from '../sessions.js'
import { calculateCost } from './usage_pricing.js'
export function modelInsights() {
    const rows = db().prepare(`SELECT model, SUM(prompt_tokens) AS p, SUM(completion_tokens) AS c, SUM(cost_usd) AS cost, COUNT(*) AS calls FROM account_usage GROUP BY model`).all()
    return rows.map(r => ({ ...r, has_pricing: calculateCost({ model: r.model, prompt_tokens: 1, completion_tokens: 1 }) > 0 }))
}
export function sessionInsights(sessionId) {
    return db().prepare(`SELECT model, SUM(prompt_tokens) AS p, SUM(completion_tokens) AS c, SUM(cost_usd) AS cost FROM account_usage WHERE session_id = ? GROUP BY model`).all(sessionId)
}
