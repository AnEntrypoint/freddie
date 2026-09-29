export { workspaceIdSchema } from './sessions.schema.js'

const passthrough = () => ({ parse: value => value, safeParse: value => ({ success: true, data: value }) })

export const workspaceViewSchema = passthrough()

export const workspaceListRequestSchema = passthrough()

export const workspaceListValueSchema = passthrough()

export const workspaceCreateRequestSchema = passthrough()

export const workspaceCreateValueSchema = passthrough()

export const workspaceRenameRequestSchema = passthrough()

export const workspaceRenameValueSchema = passthrough()

export const workspaceDeleteRequestSchema = passthrough()

export const workspaceDeleteValueSchema = passthrough()

export const workspaceInsertBeforeRequestSchema = passthrough()

export const workspaceInsertBeforeValueSchema = passthrough()

export const workspaceInsertSessionBeforeRequestSchema = passthrough()

export const workspaceInsertSessionBeforeValueSchema = passthrough()

export const workspaceArchiveSessionRequestSchema = passthrough()

export const workspaceArchiveSessionValueSchema = passthrough()
