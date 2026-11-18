export function passthrough() {
  const fn = value => value
  fn.optional = () => fn
  fn.parse = value => value
  fn.safeParse = value => ({ success: true, data: value })
  return fn
}
