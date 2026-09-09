/**
 * sessions domain shape helpers (names derived from map keys: sessionListRequestSchema /
 * sessionListValueSchema). Zod validation has been removed repo-wide: malformed requests now
 * fail differently downstream instead of being cleanly rejected here, which is an accepted
 * tradeoff, not a bug. What remains are identity pass-through stubs so sibling *.schema.js
 * files (removing zod in the same pass, some in parallel) that still reference these bindings
 * as nested shape markers (e.g. `parentSessionId: sessionIdSchema.optional()`) keep working
 * without coordination: each stub is a callable identity function that also exposes
 * `.optional()`/`.parse()`/`.safeParse()` returning the input unchanged. Once every sibling
 * file has dropped its own zod usage, these stubs can be deleted outright.
 */
import {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
  truncateUnicodeCodePoints,
} from './session-search.js'

/** Wraps a plain identity pass-through as a stub usable either as a schema-shaped marker or a validator call. */
function passthrough() {
  const fn = value => value
  fn.optional = () => fn
  fn.parse = value => value
  fn.safeParse = value => ({ success: true, data: value })
  return fn
}

/** SessionId: brand cast point (identity now; validation removed). */
export const sessionIdSchema = passthrough()

/** MessageId: identity pass-through (validation removed). */
export const messageIdSchema = passthrough()

/** WorkspaceId: identity pass-through (validation removed). Hosted here rather than in
 * workspace.schema because session.create references it while workspace.schema references
 * sessionIdSchema — schema modules must stay a DAG. */
export const workspaceIdSchema = passthrough()

/** SessionEvent shape marker (validation removed; passthrough). */
export const sessionEventSchema = passthrough()

/** SessionSummary row of session.list shape marker (validation removed; passthrough). */
export const sessionSummarySchema = passthrough()

/** session.list request payload shape marker (validation removed; passthrough). */
export const sessionListRequestSchema = passthrough()

/** session.list response value shape marker (validation removed; passthrough). */
export const sessionListValueSchema = passthrough()

/** session.search request payload shape marker (validation removed; passthrough). The prior
 * .refine() (non-empty, <=500 chars, no NUL) enforced no reshaping and is dropped per scope. */
export const sessionSearchRequestSchema = passthrough()

/** One session.search result shape marker (validation removed; passthrough). */
export const sessionSearchItemSchema = passthrough()

/** session.search response value shape marker (validation removed; passthrough). */
export const sessionSearchValueSchema = passthrough()

/** session.create request payload shape marker (validation removed; passthrough). The prior
 * .refine() ("workspaceId or cwd, not both") enforced no reshaping and is dropped per scope. */
export const sessionCreateRequestSchema = passthrough()

/** session.create response value shape marker (validation removed; passthrough). */
export const sessionCreateValueSchema = passthrough()

/** session.rename request payload shape marker (validation removed; passthrough). */
export const sessionRenameRequestSchema = passthrough()

/** session.rename response value shape marker (validation removed; passthrough). */
export const sessionRenameValueSchema = passthrough()

/** session.fork request payload shape marker (validation removed; passthrough). */
export const sessionForkRequestSchema = passthrough()

/** session.fork response value shape marker (validation removed; passthrough). */
export const sessionForkValueSchema = passthrough()

/** session.history request payload shape marker (validation removed; passthrough). */
export const sessionHistoryRequestSchema = passthrough()

/** Complete provider/model selection shape marker (validation removed; passthrough). */
export const modelSelectionSchema = passthrough()

/** One adapter-owned reasoning effort shape marker (validation removed; passthrough). */
export const modelReasoningEffortSchema = passthrough()

/** Exact-model reasoning metadata shape marker (validation removed; passthrough). */
export const modelReasoningSchema = passthrough()

/** One advisory model entry shape marker (validation removed; passthrough). */
export const modelCatalogModelSchema = passthrough()

/** One successfully loaded provider group shape marker (validation removed; passthrough). */
export const modelProviderGroupSchema = passthrough()

/** One provider-local catalog failure shape marker (validation removed; passthrough). */
export const modelCatalogFailureSchema = passthrough()

/** ToolEventView shape marker (validation removed; passthrough). */
export const toolEventViewSchema = passthrough()

/** One session.history item shape marker (validation removed; passthrough). */
export const historyEntrySchema = passthrough()

/** Projection baseline shape marker (validation removed; passthrough). */
export const sessionProjectionsBlockSchema = passthrough()

/** Persisted Session-list projection shape marker (validation removed; passthrough). */
export const sessionListMetadataProjectionSchema = passthrough()

/** imageLimits projection unit shape marker (validation removed; passthrough). */
export const imageLimitsProjectionSchema = passthrough()

/** session.history response value shape marker (validation removed; passthrough). */
export const sessionHistoryValueSchema = passthrough()

/** session.models request payload shape marker (validation removed; passthrough). */
export const sessionModelsRequestSchema = passthrough()

/** session.models response value shape marker (validation removed; passthrough). */
export const sessionModelsValueSchema = passthrough()

/** session.selectModel request payload shape marker (validation removed; passthrough). */
export const sessionSelectModelRequestSchema = passthrough()

/** session.selectModel response value shape marker (validation removed; passthrough). */
export const sessionSelectModelValueSchema = passthrough()

/** ContentBlock shape marker (validation removed; passthrough). */
export const contentBlockSchema = passthrough()

/** Raster image media type shape marker (validation removed; passthrough). */
export const imageMediaTypeSchema = passthrough()

/** Prompt wire content part shape marker (validation removed; passthrough). */
export const promptContentPartSchema = passthrough()

/** session.prompt request payload shape marker (validation removed; passthrough). */
export const sessionPromptRequestSchema = passthrough()

/** session.prompt response value shape marker (validation removed; passthrough). */
export const sessionPromptValueSchema = passthrough()

/** Opaque attachment id shape marker (validation removed; passthrough). */
export const attachmentIdSchema = passthrough()

/** Durable image reference shape marker (validation removed; passthrough). */
export const imageAttachmentRefSchema = passthrough()

/** session.attachment request payload shape marker (validation removed; passthrough). */
export const sessionAttachmentRequestSchema = passthrough()

/** session.attachment response value shape marker (validation removed; passthrough). */
export const sessionAttachmentValueSchema = passthrough()

/** session.updateQueue request payload shape marker (validation removed; passthrough). */
export const sessionUpdateQueueRequestSchema = passthrough()

/** session.updateQueue response value shape marker (validation removed; passthrough). */
export const sessionUpdateQueueValueSchema = passthrough()

/** session.cancel request payload shape marker (validation removed; passthrough). */
export const sessionCancelRequestSchema = passthrough()

/** session.cancel response value shape marker (validation removed; passthrough). */
export const sessionCancelValueSchema = passthrough()

// SESSION_SEARCH_RESULT_LIMIT / SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS / truncateUnicodeCodePoints
// are re-exported below for callers that previously reached them only via this module's zod
// refine() closures; kept imported (not used for validation) so downstream consumers relying on
// side-effect import ordering are unaffected.
export { SESSION_SEARCH_RESULT_LIMIT, SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS, truncateUnicodeCodePoints }
