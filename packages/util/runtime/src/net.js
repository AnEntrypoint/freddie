import { activeRuntime } from './runtime.js'

const { net } = activeRuntime()

export const isIP = net.isIP
