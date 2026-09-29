
export function isSettledTool(block) {
  return 'kind' in block
}

export function isRunningTool(block) {
  return !isSettledTool(block)
}
