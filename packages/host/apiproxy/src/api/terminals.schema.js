/** Terminal API identity pass-through markers. */

function passthrough() {
  const fn = value => value
  fn.optional = () => fn
  fn.parse = value => value
  fn.safeParse = value => ({ success: true, data: value })
  return fn
}

export const terminalListRequestSchema = passthrough()
export const terminalListValueSchema = passthrough()
export const terminalOpenRequestSchema = passthrough()
export const terminalOpenValueSchema = passthrough()
export const terminalSnapshotRequestSchema = passthrough()
export const terminalSnapshotValueSchema = passthrough()
export const terminalInputRequestSchema = passthrough()
export const terminalInputValueSchema = passthrough()
export const terminalResizeRequestSchema = passthrough()
export const terminalResizeValueSchema = passthrough()
export const terminalCloseRequestSchema = passthrough()
export const terminalCloseValueSchema = passthrough()
