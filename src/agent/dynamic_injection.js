/**
 * Dynamic Mid-Turn Injection System
 *
 * Injects system reminders mid-turn (plan mode, afk mode, todo reminders).
 * All state is in-memory — no filesystem dependencies.
 *
 * Browser-compatible: no `node:*` imports, no fs access.
 */

import { notificationManager } from './notifications.js'
import { getTodos } from '../../plugins/todo/handler.js'

// ---------------------------------------------------------------------------
// DynamicInjectionProvider — provider interface / base class
// ---------------------------------------------------------------------------

export class DynamicInjectionProvider {
    /**
     * @param {string} sessionId
     * @param {object} context — arbitrary context bag (planModeActive, afkActive, todos, etc.)
     * @returns {{ text: string, priority: number }[]}
     */
    getInjections(_sessionId, _context) { return [] }

    /** Reset throttling after context compaction. */
    onContextCompacted(_sessionId) {}

    /** Reset on afk toggle. */
    onAfkChanged(_sessionId, _enabled) {}
}

// ---------------------------------------------------------------------------
// Built-in providers
// ---------------------------------------------------------------------------

const PLAN_MODE_REMINDER_INTERVAL = 5 // inject every N turns
const PLAN_MODE_REMINDER_TEXT = 'You are currently in plan mode. You are restricted to read-only operations. Do not write or edit any files. When you are ready to propose your plan, use the exit_plan_mode tool.'

export class PlanModeInjectionProvider extends DynamicInjectionProvider {
    #turnCounts = new Map() // sessionId -> turn count

    getInjections(sessionId, context) {
        if (!context.planModeActive) return []
        const count = (this.#turnCounts.get(sessionId) || 0) + 1
        this.#turnCounts.set(sessionId, count)
        if (count > 1 && count % PLAN_MODE_REMINDER_INTERVAL === 0) {
            return [{ text: PLAN_MODE_REMINDER_TEXT, priority: 10 }]
        }
        return []
    }

    onContextCompacted(sessionId) {
        this.#turnCounts.set(sessionId, 0)
    }
}

const AFK_MODE_REMINDER_INTERVAL = 3
const AFK_MODE_REMINDER_TEXT = 'AFK mode is active. The user is not watching. Do not ask questions — make your best judgment and proceed autonomously.'

export class AfkModeInjectionProvider extends DynamicInjectionProvider {
    #turnCounts = new Map()

    getInjections(sessionId, context) {
        if (!context.afkActive) return []
        const count = (this.#turnCounts.get(sessionId) || 0) + 1
        this.#turnCounts.set(sessionId, count)
        if (count > 1 && count % AFK_MODE_REMINDER_INTERVAL === 0) {
            return [{ text: AFK_MODE_REMINDER_TEXT, priority: 10 }]
        }
        return []
    }

    onContextCompacted(sessionId) {
        this.#turnCounts.set(sessionId, 0)
    }

    onAfkChanged(sessionId, enabled) {
        if (!enabled) this.#turnCounts.delete(sessionId)
    }
}

const TODO_REMINDER_INTERVAL = 3
const TODO_REMINDER_TEXT = 'You have incomplete todo items. See the current todo list below and prioritize completing them.'

export class TodoInjectionProvider extends DynamicInjectionProvider {
    #turnCounts = new Map()

    getInjections(sessionId, context) {
        // Read from the actual todo_list state (in-memory Map), falling back
        // to context.todos if the caller passes an explicit override.
        const todos = (context.todos && Array.isArray(context.todos) && context.todos.length > 0)
            ? context.todos
            : getTodos(sessionId)
        if (!Array.isArray(todos) || todos.length === 0) return []
        const count = (this.#turnCounts.get(sessionId) || 0) + 1
        this.#turnCounts.set(sessionId, count)
        if (count > 1 && count % TODO_REMINDER_INTERVAL === 0) {
            const todoList = todos
                .filter(t => t.status !== 'done')
                .map(t => `- [${t.status}] ${t.title}`)
                .join('\n')
            if (!todoList) return []
            return [{ text: TODO_REMINDER_TEXT + '\n\n' + todoList, priority: 5 }]
        }
        return []
    }

    onContextCompacted(sessionId) {
        this.#turnCounts.set(sessionId, 0)
    }
}

const NOTIFICATION_INJECTION_INTERVAL = 1 // inject every turn when pending

export class NotificationInjectionProvider extends DynamicInjectionProvider {
    #turnCounts = new Map()

    getInjections(sessionId, _context) {
        if (!notificationManager.hasPending()) return []
        const count = (this.#turnCounts.get(sessionId) || 0) + 1
        this.#turnCounts.set(sessionId, count)
        if (count % NOTIFICATION_INJECTION_INTERVAL !== 0) return []
        const pending = notificationManager.deliverPending()
        if (!pending.length) return []
        const text = '<system-reminder>\nNotifications:\n' +
            pending.map(n => `- [${n.type}] ${n.message}`).join('\n') +
            '\n</system-reminder>'
        return [{ text, priority: 20 }]
    }

    onContextCompacted(sessionId) {
        this.#turnCounts.set(sessionId, 0)
    }
}

const GOAL_REMINDER_INTERVAL = 3 // inject every N turns
const GOAL_REMINDER_TEXT = 'You are working toward a goal. Use get_goal to check your progress.'

export class GoalInjectionProvider extends DynamicInjectionProvider {
    #turnCounts = new Map() // sessionId -> turn count

    getInjections(sessionId, context) {
        const goal = context.goal
        if (!goal || goal.status !== 'active') return []
        const injections = []
        const count = (this.#turnCounts.get(sessionId) || 0) + 1
        this.#turnCounts.set(sessionId, count)
        // Periodic reminder every N turns.
        if (count > 1 && count % GOAL_REMINDER_INTERVAL === 0) {
            injections.push({ text: GOAL_REMINDER_TEXT, priority: 5 })
        }
        // Budget warnings when close to limits.
        const budgets = goal.budgets || {}
        if (budgets.turns && count >= budgets.turns * 0.8) {
            injections.push({
                text: `Goal budget warning: ${count} of ${budgets.turns} turns used.`,
                priority: 8,
            })
        }
        return injections
    }

    onContextCompacted(sessionId) {
        this.#turnCounts.set(sessionId, 0)
    }
}

// ---------------------------------------------------------------------------
// InjectionManager — singleton
// ---------------------------------------------------------------------------

let _instance = null

export class InjectionManager {
    /** @type {DynamicInjectionProvider[]} */
    #providers = []

    constructor() {
        if (_instance) return _instance
        // Register built-in providers on first construction.
        this.#providers = [
            new PlanModeInjectionProvider(),
            new AfkModeInjectionProvider(),
            new TodoInjectionProvider(),
            new NotificationInjectionProvider(),
            new GoalInjectionProvider(),
        ]
        _instance = this
    }

    /**
     * Register a provider. Already-registered instances are skipped (identity check).
     * @param {DynamicInjectionProvider} provider
     */
    registerProvider(provider) {
        if (!(provider instanceof DynamicInjectionProvider)) {
            throw new Error('provider must be an instance of DynamicInjectionProvider')
        }
        if (this.#providers.includes(provider)) return
        this.#providers.push(provider)
    }

    /**
     * Collect injection texts from all registered providers.
     * Results are sorted by priority (highest first), then deduplicated by text.
     * @param {string} sessionId
     * @param {object} context — { planModeActive?, afkActive?, todos?, ... }
     * @returns {string[]} injection texts
     */
    collectInjections(sessionId, context = {}) {
        const all = []
        for (const p of this.#providers) {
            try {
                const injections = p.getInjections(sessionId, context)
                if (Array.isArray(injections)) all.push(...injections)
            } catch (_) { /* best-effort — never throw into the agent loop */ }
        }
        // Sort by priority descending, deduplicate by text, return text only.
        all.sort((a, b) => (b.priority || 0) - (a.priority || 0))
        const seen = new Set()
        const texts = []
        for (const inj of all) {
            if (!inj || typeof inj.text !== 'string') continue
            if (seen.has(inj.text)) continue
            seen.add(inj.text)
            texts.push(inj.text)
        }
        return texts
    }

    /** Notify all providers that context was compacted. */
    onContextCompacted(sessionId) {
        for (const p of this.#providers) {
            try { p.onContextCompacted(sessionId) } catch (_) {}
        }
    }

    /** Notify all providers of an afk toggle. */
    onAfkChanged(sessionId, enabled) {
        for (const p of this.#providers) {
            try { p.onAfkChanged(sessionId, enabled) } catch (_) {}
        }
    }

    /** Remove all providers (for testing). */
    clear() {
        this.#providers.length = 0
    }

    /** Get the singleton instance. */
    static get instance() {
        if (!_instance) _instance = new InjectionManager()
        return _instance
    }

    /** Reset the singleton (for testing). */
    static reset() {
        _instance = null
    }
}