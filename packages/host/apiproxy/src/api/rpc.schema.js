/**
 * Message-layer pass-throughs: the four wire full forms + error body +
 * carrier receipt. Validation was removed repo-wide (schema library dropped);
 * these are no-op identity passes kept under their original names so call
 * sites that do `xSchema.parse(value)` / `.safeParse(value)` keep working
 * unchanged. Malformed input is no longer rejected here — it fails
 * differently downstream, which is an accepted tradeoff, not a bug.
 */

/** Identity pass-through with the minimal parse/safeParse surface callers use. */
function passthrough() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  }
}

/** RpcId: no cast, no validation — the id is an opaque echo token, passed through as-is. */
export const rpcIdSchema = passthrough()

/** Error body pass-through (was a discriminated union keyed by code). */
export const rpcErrorSchema = passthrough()

/**
 * Business success/failure result pass-through (generic, reusable).
 * @param _value - Unused; kept for call-site compatibility (was the business value schema).
 * @returns Pass-through for RpcResult<T>.
 */
export function rpcResultSchema(_value) {
  return passthrough()
}

// ---- The four wire full-form pass-throughs (payload/result.value slots stay wide — business layer does the second parse) ----

/** ClientRequest full form pass-through. */
export const clientRequestSchema = passthrough()

/** ServerResponse full form pass-through. */
export const serverResponseSchema = passthrough()

/** ServerRequest full form pass-through. */
export const serverRequestSchema = passthrough()

/** ClientResponse full form pass-through. */
export const clientResponseSchema = passthrough()

/** Wire full-form pass-through (was discriminated by type). */
export const rpcMessageSchema = passthrough()

/** Carrier receipt pass-through. */
export const rpcReceiptSchema = passthrough()
