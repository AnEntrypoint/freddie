import { activeRuntime } from './runtime.js'

const { timersPromises } = activeRuntime()

export const scheduler = timersPromises.scheduler
export const setTimeout = timersPromises.setTimeout
