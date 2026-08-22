import { createGoal, getGoal, updateGoal, setGoalBudget } from '../../plugins/goal/state.js'

const STATUS_WORDS = new Set(['done', 'completed', 'active', 'blocked', 'paused'])
const STATUS_ALIAS = { done: 'completed' }

function formatGoal(goal) {
    if (!goal) return '(no goal set for this session)'
    const budgets = Object.entries(goal.budgets || {}).map(([u, v]) => `${v}${u}`).join(', ') || 'none'
    return `  objective: ${goal.objective}\n  criterion: ${goal.completionCriterion || '(none)'}\n  status: ${goal.status}\n  budgets: ${budgets}${goal.terminalReason ? `\n  reason: ${goal.terminalReason}` : ''}`
}

export function goalCommand(sessionId, args) {
    if (!args.length) return formatGoal(getGoal(sessionId))

    const existing = getGoal(sessionId)
    const first = args[0].toLowerCase()
    if (existing && args.length === 1 && STATUS_WORDS.has(first)) {
        try { return formatGoal(updateGoal(sessionId, { status: STATUS_ALIAS[first] || first })) }
        catch (e) { return 'error: ' + e.message }
    }
    if (existing && first === 'budget' && Number.isFinite(Number(args[1]))) {
        const value = Number(args[1])
        const unit = args[2]
        if (!unit) return 'usage: /goal budget <value> <turns|tokens|milliseconds|seconds|minutes|hours>'
        try { return formatGoal(setGoalBudget(sessionId, { value, unit })) }
        catch (e) { return 'error: ' + e.message }
    }

    const objective = args.join(' ')
    try { return formatGoal(createGoal(sessionId, { objective, replace: true })) }
    catch (e) { return 'error: ' + e.message }
}
