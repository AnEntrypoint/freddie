// In-memory todo list per session, browser-safe
// Kimi SetTodoList-compatible: manages todos with {title, status: pending|in_progress|done}
// - Pass `todos` array to update the list, omit to read current list
// - Pass empty array to clear

const _todos = new Map() // sessionKey -> [{title, status, updatedAt}]

export const todoListTool = {
    name: 'todo_list',
    toolset: 'core',
    schema: {
        name: 'todo_list',
        description:
            'Manage a structured TODO list. Pass todos to update, or omit to read current list. ' +
            'Pass an empty array to clear. Use this to track progress through multi-step tasks.',
        parameters: {
            type: 'object',
            properties: {
                todos: {
                    type: 'array',
                    description: 'The updated todo list. Omit to read current list. Pass empty array to clear.',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Short, actionable title for the todo' },
                            status: { type: 'string', enum: ['pending', 'in_progress', 'done'], description: 'Current status of the todo' },
                        },
                        required: ['title', 'status'],
                    },
                },
            },
        },
    },
    handler: async (args, ctx) => {
        const key = ctx?.sessionKey || 'default'
        if (args.todos === undefined) {
            // Read mode
            const items = _todos.get(key) || []
            return { todos: items, count: items.length }
        }
        // Write mode
        const items = args.todos.map(t => ({ ...t, updatedAt: new Date().toISOString() }))
        _todos.set(key, items)
        return { todos: items, count: items.length, updated: true }
    },
    checkFn: () => true,
}

// Exported for TodoInjectionProvider to read active todo state
export function getTodos(sessionKey = 'default') {
    return _todos.get(sessionKey) || []
}