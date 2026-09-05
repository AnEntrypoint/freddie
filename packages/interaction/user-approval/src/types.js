/**
 * Wire-safe approval identifiers and outcome vocabulary, free of
 * cordis/service imports so browser type chains (apiproxy api → client) can
 * consume them without loading this package's Context augmentation.
 * @module @freddie/freddie-user-approval/types
 */

/**
 * Brand a string as an ApprovalRequestId.
 * @param id - the raw id string to brand.
 * @returns the same string carrying the brand.
 */
export function ApprovalRequestId(id) {
  return id
}
