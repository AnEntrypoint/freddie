// Shared module-level state for the in-memory task registry. All split files
// import and mutate `_tasks` / `_reconcileInterval` directly — never a copy.
export const _tasks = new Map()
export const _reconcileState = { interval: null }

export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
