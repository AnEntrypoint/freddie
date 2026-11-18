import { activeRuntime } from './runtime.js'

const { crypto } = activeRuntime()

export const createHash = crypto.createHash
export const randomBytes = crypto.randomBytes
export const randomUUID = crypto.randomUUID
