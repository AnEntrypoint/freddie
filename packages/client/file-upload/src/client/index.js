/**
 * Browser half of the file-upload plugin: provides `ctx.fileUpload`.
 * @module @freddie/freddie-client-file-upload/client
 */

import { FileUploadRuntime } from './runtime.js'

/** The upload service needs no other browser service. */
export const inject = []

export { FileUploadRuntime } from './runtime.js'
export { progressStream } from './progress.js'
export { FILE_UPLOAD_ROUTE } from '../shared.js'

/**
 * Provide the browser background-upload service.
 * @param ctx - Client plugin context.
 */
export function apply(ctx) {
  ctx.plugin(FileUploadRuntime)
}
