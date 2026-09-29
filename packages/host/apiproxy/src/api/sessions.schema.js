import {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
  truncateUnicodeCodePoints,
} from './session-search.js'

function passthrough() {
  const fn = value => value
  fn.optional = () => fn
  fn.parse = value => value
  fn.safeParse = value => ({ success: true, data: value })
  return fn
}

export const sessionIdSchema = passthrough()

export const messageIdSchema = passthrough()

export const workspaceIdSchema = passthrough()

export const sessionEventSchema = passthrough()

export const sessionSummarySchema = passthrough()

export const sessionListRequestSchema = passthrough()

export const sessionListValueSchema = passthrough()

export const sessionSearchRequestSchema = passthrough()

export const sessionSearchItemSchema = passthrough()

export const sessionSearchValueSchema = passthrough()

export const sessionCreateRequestSchema = passthrough()

export const sessionCreateValueSchema = passthrough()

export const sessionRenameRequestSchema = passthrough()

export const sessionRenameValueSchema = passthrough()

export const sessionForkRequestSchema = passthrough()

export const sessionForkValueSchema = passthrough()

export const sessionHistoryRequestSchema = passthrough()

export const modelSelectionSchema = passthrough()

export const modelReasoningEffortSchema = passthrough()

export const modelReasoningSchema = passthrough()

export const modelCatalogModelSchema = passthrough()

export const modelProviderGroupSchema = passthrough()

export const modelCatalogFailureSchema = passthrough()

export const toolEventViewSchema = passthrough()

export const historyEntrySchema = passthrough()

export const sessionProjectionsBlockSchema = passthrough()

export const sessionListMetadataProjectionSchema = passthrough()

export const imageLimitsProjectionSchema = passthrough()

export const sessionHistoryValueSchema = passthrough()

export const sessionModelsRequestSchema = passthrough()

export const sessionModelsValueSchema = passthrough()

export const sessionSelectModelRequestSchema = passthrough()

export const sessionSelectModelValueSchema = passthrough()

export const contentBlockSchema = passthrough()

export const imageMediaTypeSchema = passthrough()

export const promptContentPartSchema = passthrough()

export const sessionPromptRequestSchema = passthrough()

export const sessionPromptValueSchema = passthrough()

export const attachmentIdSchema = passthrough()

export const imageAttachmentRefSchema = passthrough()

export const sessionAttachmentRequestSchema = passthrough()

export const sessionAttachmentValueSchema = passthrough()

export const sessionUpdateQueueRequestSchema = passthrough()

export const sessionUpdateQueueValueSchema = passthrough()

export const sessionCancelRequestSchema = passthrough()

export const sessionCancelValueSchema = passthrough()

export { SESSION_SEARCH_RESULT_LIMIT, SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS, truncateUnicodeCodePoints }
