import { activeRuntime } from './runtime.js'

const { dnsPromises } = activeRuntime()

export default dnsPromises
