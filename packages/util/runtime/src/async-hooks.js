import { activeRuntime } from './runtime.js'

const { asyncHooks } = activeRuntime()

export const AsyncLocalStorage = asyncHooks.AsyncLocalStorage
