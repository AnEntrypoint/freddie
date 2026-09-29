
export function planSummary(todos) {
  const active = todos.filter(t => t.status === 'in_progress')
  const first = active[0]?.content
  const named = typeof first === 'string' && first.trim() !== ''
  return {
    done: todos.filter(t => t.status === 'completed').length,
    total: todos.length,
    activeContent: named ? first : null,
    activeExtra: named ? active.length - 1 : 0,
  }
}
