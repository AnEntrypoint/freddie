import { activeRuntime } from './runtime.js'

const { perfHooks } = activeRuntime()

export const performance = perfHooks.performance
