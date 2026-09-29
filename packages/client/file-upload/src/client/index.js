import { FileUploadRuntime } from './runtime.js'

export const inject = []

export { FileUploadRuntime } from './runtime.js'
export { progressStream } from './progress.js'
export { FILE_UPLOAD_ROUTE } from '../shared.js'

export function apply(ctx) {
  ctx.plugin(FileUploadRuntime)
}
