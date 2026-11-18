import { activeRuntime } from './runtime.js'

const { path } = activeRuntime()

export const basename = path.basename
export const delimiter = path.delimiter
export const dirname = path.dirname
export const extname = path.extname
export const isAbsolute = path.isAbsolute
export const join = path.join
export const normalize = path.normalize
export const parse = path.parse
export const posix = path.posix
export const relative = path.relative
export const resolve = path.resolve
export const sep = path.sep
export const toNamespacedPath = path.toNamespacedPath
export const win32 = path.win32
