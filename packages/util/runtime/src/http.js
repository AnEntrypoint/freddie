import { activeRuntime } from './runtime.js'

const { http } = activeRuntime()

export const createServer = http.createServer
export const validateHeaderValue = http.validateHeaderValue
export default http
