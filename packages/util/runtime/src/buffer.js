import { activeRuntime } from './runtime.js'

const { buffer } = activeRuntime()

export const Buffer = buffer.Buffer
export const constants = buffer.constants
