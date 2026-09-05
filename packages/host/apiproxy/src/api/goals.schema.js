/**
 * goals domain request/response shape helpers (zod removed — validation
 * dropped per repo-wide decision; malformed requests now fail downstream
 * instead of being rejected at the boundary). Mutation-only shapes: every
 * value is a `{ ref }` acknowledgement (clear: `{ cleared }`) — the current
 * goal state travels exclusively on the 'goal' session projection.
 *
 * Each export below is a plain pass-through "schema" object exposing
 * `.parse(value)` that returns its input unchanged, kept under its original
 * name/shape only because packages/host/apiproxy/src/fetch/client.js and
 * .../fetch/handler.js reference these exports by name in shared dispatch
 * tables covering every apiproxy domain (edited in parallel by sibling
 * agents in this same batch) — not touched here to avoid colliding with
 * those concurrent edits.
 */

const passthrough = () => ({ parse: value => value, safeParse: value => ({ success: true, data: value }) })

/** GoalRef shape marker (no-op). */
export const goalRefSchema = passthrough()

/** goal.create request payload (no-op). */
export const goalCreateRequestSchema = passthrough()

/** goal.create response value (no-op). */
export const goalCreateValueSchema = passthrough()

/** goal.edit request payload (no-op; previously enforced objective or maxGoalRounds present). */
export const goalEditRequestSchema = passthrough()

/** goal.edit response value (no-op). */
export const goalEditValueSchema = passthrough()

/** goal.pause request payload (no-op). */
export const goalPauseRequestSchema = passthrough()

/** goal.pause response value (no-op). */
export const goalPauseValueSchema = passthrough()

/** goal.resume request payload (no-op). */
export const goalResumeRequestSchema = passthrough()

/** goal.resume response value (no-op). */
export const goalResumeValueSchema = passthrough()

/** goal.complete request payload (no-op). */
export const goalCompleteRequestSchema = passthrough()

/** goal.complete response value (no-op). */
export const goalCompleteValueSchema = passthrough()

/** goal.clear request payload (no-op). */
export const goalClearRequestSchema = passthrough()

/** goal.clear response value (no-op). */
export const goalClearValueSchema = passthrough()
