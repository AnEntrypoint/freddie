import { conversationContextKey } from '@freddie/freddie-client-runtime/client'

function toolNode(node) {
  return node?.kind === 'tool-call' ? node : undefined
}

export function rootToolCall(snapshot, rootCallId) {
  return toolNode(snapshot.chat.nodes.get(conversationContextKey('tool-call', rootCallId)))?.data.root
}

export function findToolCall(snapshot, callId) {
  const visit = (block) => {
    if (block.callId === callId) return block
    for (const child of block.subCalls) {
      const found = visit(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const node of snapshot.chat.nodes.values()) {
    const root = toolNode(node)?.data.root
    if (root === undefined) continue
    const found = visit(root)
    if (found !== undefined) return found
  }
  return undefined
}
