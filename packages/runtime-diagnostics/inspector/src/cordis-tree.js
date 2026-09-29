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
