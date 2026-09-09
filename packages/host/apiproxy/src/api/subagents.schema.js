/**
 * Browser-safe subagent domain shapes (validation removed).
 *
 * These were previously zod schemas performing pure shape validation (no
 * transform/default logic) for the subagent.* RPC methods. Per the
 * project-wide decision to drop schema validation, they are no longer zod
 * objects — malformed requests/responses now fail downstream instead of
 * being rejected at this boundary.
 *
 * NOTE: packages/host/apiproxy/src/fetch/handler.js still calls
 * `route.schema.safeParse(...)` and packages/host/apiproxy/src/fetch/client.js
 * still calls `UNARY_VALUE_SCHEMAS[method].parse(...)` — those are shared
 * carrier files touched by many schema modules at once (handler.js already
 * has a "schema validation removed" note for its other no-validation path),
 * so rather than break their live call sites from this single-file pass,
 * each export below is kept as a trivial pass-through object exposing
 * `.parse`/`.safeParse` that always succeeds and returns the input
 * unchanged. A later cross-cutting pass can simplify handler.js/client.js
 * to call these directly as plain identity functions and drop this shim.
 */

/** Trivial always-succeeds stand-in for a removed zod schema. */
function passthroughSchema() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  }
}

/** Healthy and diagnostic durable catalog rows. */
export const subagentListEntrySchema = passthroughSchema()

/** subagent.list request payload. */
export const subagentListRequestSchema = passthroughSchema()

/** subagent.list response value. */
export const subagentListValueSchema = passthroughSchema()

/** subagent.history request payload. */
export const subagentHistoryRequestSchema = passthroughSchema()

/** subagent.history response value. */
export const subagentHistoryValueSchema = passthroughSchema()

/** subagent.prompt request payload. */
export const subagentPromptRequestSchema = passthroughSchema()

/** subagent.interrupt request payload. */
export const subagentInterruptRequestSchema = passthroughSchema()

/** subagent.interrupt response value. */
export const subagentInterruptValueSchema = passthroughSchema()

/** subagent.prompt response value. */
export const subagentPromptValueSchema = passthroughSchema()
