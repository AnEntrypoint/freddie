// Goal tracking state — in-memory, browser-compatible
// Per-session goal tracking with budgets and status lifecycle

import { telemetry } from '../../src/observability/telemetry.js'

const _goals = new Map() // sessionId -> goal object

/**
 * @typedef {object} Goal
 * @property {string} objective
 * @property {string} [completionCriterion]
 * @property {'active'|'completed'|'blocked'|'paused'} status
 * @property {object} budgets
 * @property {number} [budgets.turns]
 * @property {number} [budgets.tokens]
 * @property {number} [budgets.milliseconds]
 * @property {number} [budgets.seconds]
 * @property {number} [budgets.minutes]
 * @property {number} [budgets.hours]
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} [terminalReason]
 */

/**
 * Create a goal for a session.
 * @param {string} sessionId
 * @param {{ objective: string, completionCriterion?: string, replace?: boolean }} params
 * @returns {Goal}
 */
export function createGoal(sessionId, { objective, completionCriterion, replace } = {}) {
    if (!objective) throw new Error('objective is required')
    if (_goals.has(sessionId) && !replace) {
        throw new Error('a goal already exists for this session; use replace=true to overwrite')
    }
    const now = new Date().toISOString()
    const goal = {
        objective,
        completionCriterion: completionCriterion || '',
        status: 'active',
        budgets: {},
        createdAt: now,
        updatedAt: now,
        terminalReason: '',
    }
    _goals.set(sessionId, goal)
    telemetry.goalCreated({ session_id: sessionId, objective })
    return goal
}

/**
 * Get the current goal for a session.
 * @param {string} sessionId
 * @returns {Goal|null}
 */
export function getGoal(sessionId) {
    return _goals.get(sessionId) || null
}

/**
 * Update the goal status for a session.
 * @param {string} sessionId
 * @param {{ status: 'active'|'completed'|'blocked'|'paused', terminalReason?: string }} params
 * @returns {Goal}
 */
export function updateGoal(sessionId, { status, terminalReason } = {}) {
    const goal = _goals.get(sessionId)
    if (!goal) throw new Error('no goal found for this session')
    const valid = ['active', 'completed', 'blocked', 'paused']
    if (!valid.includes(status)) throw new Error(`invalid status: ${status}; must be one of ${valid.join(', ')}`)
    goal.status = status
    goal.updatedAt = new Date().toISOString()
    if (terminalReason !== undefined) {
        goal.terminalReason = terminalReason
    }
    if (status === 'completed') telemetry.goalCompleted({ session_id: sessionId, objective: goal.objective })
    if (status === 'blocked') telemetry.goalBlocked({ session_id: sessionId, objective: goal.objective, reason: terminalReason || '' })
    return goal
}

/**
 * Set a budget limit for the session's goal.
 * @param {string} sessionId
 * @param {{ value: number, unit: string }} params
 * @returns {Goal}
 */
export function setGoalBudget(sessionId, { value, unit } = {}) {
    const goal = _goals.get(sessionId)
    if (!goal) throw new Error('no goal found for this session')
    const validUnits = ['turns', 'tokens', 'milliseconds', 'seconds', 'minutes', 'hours']
    if (!validUnits.includes(unit)) throw new Error(`invalid unit: ${unit}; must be one of ${validUnits.join(', ')}`)
    if (typeof value !== 'number' || value < 0) throw new Error('value must be a non-negative number')
    goal.budgets[unit] = value
    goal.updatedAt = new Date().toISOString()
    return goal
}

/**
 * Clear the goal for a session.
 * @param {string} sessionId
 */
export function clearGoal(sessionId) {
    _goals.delete(sessionId)
}

/**
 * Reset all goal state (for testing).
 */
export function reset() {
    _goals.clear()
}