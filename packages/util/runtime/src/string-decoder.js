import { activeRuntime } from './runtime.js'

const { stringDecoder } = activeRuntime()

export const StringDecoder = stringDecoder.StringDecoder
