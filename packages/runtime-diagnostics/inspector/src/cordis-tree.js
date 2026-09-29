/**
 * Cordis topology projection for the Elements panel.
 *
 * The Worker never touches live Cordis objects: this runs on the Host and emits
 * a plain JSON snapshot the Worker stores and projects. Upstream includes the
 * Context-only `extend()`/`isolate()`/`intercept()` layers as direct Context
 * descendants; freddie's `framework/cordis` keeps no child-Context registry, so
 * only fiber-backed contexts appear (see the README's deferred work).
 * @module @freddie/freddie-inspector/cordis-tree
 */

/**
 * Project the reachable Context/Fiber graph into a JSON snapshot.
 *
 * Cordis tracks fibers, not child contexts: every loaded plugin owns a `Fiber`
 * whose `parent` is the Context it was loaded from and whose `ctx` is its own
 * Context. Grouping fibers by `parent` therefore reconstructs the tree, with the
 * root fiber omitted exactly as upstream omits it.
 *
 * @param {import('@freddie/cordis').Context} root - the Host root context.
 * @param {number} maxNodes - Context and Fiber nodes admitted before truncation.
 * @returns {{ realm: 'host', truncated: boolean, nodes: object[] }} one detached snapshot.
 */
export function collectCordisTree(root, maxNodes) {
  const childrenOf = new Map()
  for (const runtime of root.registry.values()) {
    for (const fiber of runtime.fibers) {
      if (fiber.uid === null || fiber.uid === undefined) continue
      const parent = fiber.parent
      let siblings = childrenOf.get(parent)
      if (siblings === undefined) childrenOf.set(parent, siblings = [])
      siblings.push({ fiber, runtime })
    }
  }

  const truncated = { at: false }
  let budget = maxNodes

  const visitContext = (context) => {
    const node = { kind: 'context', children: [] }
    const siblings = childrenOf.get(context)
    if (siblings === undefined) return node
    for (const { fiber, runtime } of siblings) {
      if (budget <= 0) {
        truncated.at = true
        break
      }
      budget -= 1
      const fiberNode = {
        kind: 'fiber',
        uid: fiber.uid,
        name: runtime.name ?? '(anonymous)',
        state: String(fiber.state ?? 'unknown'),
        children: [],
      }
      if (budget > 0) {
        budget -= 1
        fiberNode.children.push(visitContext(fiber.ctx))
      } else {
        truncated.at = true
      }
      node.children.push(fiberNode)
    }
    return node
  }

  const rootNode = visitContext(root)
  rootNode.name = 'root'
  return { realm: 'host', truncated: truncated.at, nodes: [rootNode] }
}
