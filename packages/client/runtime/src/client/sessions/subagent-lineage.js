/**
 * Pure subagent-lineage aggregation over the retained session-list mirror.
 * Ordinary forks terminate propagation so each visible session owns only its
 * uninterrupted subagent subtree.
 * @module @freddie/freddie-client-runtime/client/sessions/subagent-lineage
 */

/**
 * Index direct subagents by their immediate parent. Sidebar status describes
 * work the selected session started directly; nested work remains visible in
 * the Operations tree instead of inflating the parent’s running count.
 * @param summaries - retained session summaries keyed by id.
 * @returns direct-child totals and running totals keyed by possible parent id.
 */
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
