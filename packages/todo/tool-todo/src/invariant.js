const PACKAGE_NAME = '@freddie/freddie-tool-todo'
const TODO_STATUSES = new Set(['pending', 'in_progress', 'completed'])

export const name = 'tool-todo-invariant'
export const inject = ['invariants']

function validateTodos(value, fail) {
  if (!Array.isArray(value)) fail('todo/write todos must be an array')
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'object' || item === null) fail('todo/write entries must be objects')
    const { content, status } = item
    if (typeof content !== 'string' || content.length === 0 || content.trim() !== content) {
      fail('todo/write content must be non-empty and already trimmed')
    }
    if (seen.has(content)) fail(`todo/write repeats content ${JSON.stringify(content)}`)
    seen.add(content)
    if (typeof status !== 'string' || !TODO_STATUSES.has(status)) {
      fail(`todo/write carries unknown status ${JSON.stringify(status)}`)
    }
  }
}

function validateEvent(event, fail) {
  if (event.type === 'todo/write') validateTodos(event.data.todos, fail)
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateEvent(event, fail)
  }
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const event = args[1]
    validateEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
