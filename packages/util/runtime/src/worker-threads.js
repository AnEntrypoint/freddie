import { activeRuntime } from './runtime.js'

const { workerThreads } = activeRuntime()

export const MessageChannel = workerThreads.MessageChannel
export const Worker = workerThreads.Worker
export const parentPort = workerThreads.parentPort
export const workerData = workerThreads.workerData
