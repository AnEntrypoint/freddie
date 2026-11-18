import { activeRuntime } from './runtime.js'

const { stream } = activeRuntime()

export const PassThrough = stream.PassThrough
export const Readable = stream.Readable
export const Writable = stream.Writable
export const pipeline = stream.pipeline
