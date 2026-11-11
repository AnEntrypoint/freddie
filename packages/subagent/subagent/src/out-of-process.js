export function assertPositiveFinite(prefix, name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${prefix}: ${name} must be a positive finite number`)
  }
}
