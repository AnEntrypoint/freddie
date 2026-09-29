
export function indexSubagentDescendants(
  summaries,
) {
  const indexed = new Map()
  for (const descendant of Object.values(summaries)) {
    if (descendant.origin !== 'subagent' || descendant.parentId === undefined) continue
    const direct = indexed.get(descendant.parentId)
    if (direct === undefined) {
      indexed.set(descendant.parentId, {
        count: 1,
        runningCount: descendant.running ? 1 : 0,
      })
    } else {
      direct.count += 1
      if (descendant.running) direct.runningCount += 1
    }
  }
  return indexed
}
