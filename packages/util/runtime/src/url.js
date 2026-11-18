import { activeRuntime } from './runtime.js'

const { url } = activeRuntime()

export const fileURLToPath = url.fileURLToPath
export const pathToFileURL = url.pathToFileURL
