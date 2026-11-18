import { activeRuntime } from './runtime.js'

const { utilTypes } = activeRuntime()

export const isPromise = utilTypes.isPromise
