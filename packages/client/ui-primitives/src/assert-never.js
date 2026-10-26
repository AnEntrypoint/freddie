function render(value) {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function assertNever(value, context) {
  throw new Error(`unreachable variant in ${context}: ${render(value)}`)
}
