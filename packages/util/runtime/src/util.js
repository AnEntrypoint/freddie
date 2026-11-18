import { activeRuntime } from './runtime.js'

const { util } = activeRuntime()

export const TextDecoder = util.TextDecoder
export const inspect = util.inspect
export const isDeepStrictEqual = util.isDeepStrictEqual
export const parseArgs = util.parseArgs
export const parseEnv = util.parseEnv
export const promisify = util.promisify
