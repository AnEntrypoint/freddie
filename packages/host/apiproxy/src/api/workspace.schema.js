/**
 * workspace domain plain parse/pass-through helpers (names derived from map
 * keys, `Schema` suffix kept for now). Zod validation has been removed
 * repo-wide; these objects keep a `.parse(x) => x` shape only because
 * packages/host/apiproxy/src/fetch/client.js and .../fetch/handler.js still
 * dispatch through UNARY_VALUE_SCHEMAS / request-schema tables keyed by these
 * exports across every apiproxy domain (not just this file) — leaving the
 * pass-through in place avoids colliding with the sibling agents converting
 * client.js/handler.js and the other schema files in this same batch.
 * The WorkspaceId brand cast lives in sessions.schema (see the note there)
 * and is re-exported here as the domain-local name.
 */

export { workspaceIdSchema } from './sessions.schema.js'

const passthrough = () => ({ parse: value => value, safeParse: value => ({ success: true, data: value }) })

/** WorkspaceView row of every workspace.* response. */
export const workspaceViewSchema = passthrough()

/** workspace.list request payload (empty object literal). */
export const workspaceListRequestSchema = passthrough()

/** workspace.list response value. */
export const workspaceListValueSchema = passthrough()

/** workspace.create request payload: the existing directory to adopt. */
export const workspaceCreateRequestSchema = passthrough()

/** workspace.create response value. */
export const workspaceCreateValueSchema = passthrough()

/**
 * workspace.rename request payload. Was zod .refine(title non-blank); that
 * validation is dropped per the repo-wide zod removal, so this is now a pure
 * pass-through and the non-blank rule is no longer enforced here.
 */
export const workspaceRenameRequestSchema = passthrough()

/** workspace.rename response value. */
export const workspaceRenameValueSchema = passthrough()

/** workspace.delete request payload. */
export const workspaceDeleteRequestSchema = passthrough()

/** workspace.delete response value. */
export const workspaceDeleteValueSchema = passthrough()

/** workspace.insertBefore request payload (anchor omitted = append to end). */
export const workspaceInsertBeforeRequestSchema = passthrough()

/** workspace.insertBefore response value: the complete durable display order. */
export const workspaceInsertBeforeValueSchema = passthrough()

/** workspace.insertSessionBefore request payload (anchor omitted = append to end). */
export const workspaceInsertSessionBeforeRequestSchema = passthrough()

/** workspace.insertSessionBefore response value. */
export const workspaceInsertSessionBeforeValueSchema = passthrough()

/** workspace.archiveSession request payload. */
export const workspaceArchiveSessionRequestSchema = passthrough()

/** workspace.archiveSession response value: the full updated archive set. */
export const workspaceArchiveSessionValueSchema = passthrough()
