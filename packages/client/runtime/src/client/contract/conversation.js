export function conversationContextKey(kind, id) {
  return `${kind.length}:${kind}${id}`
}
