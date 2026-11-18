import { activeRuntime } from './runtime.js'

const { inspector } = activeRuntime()

export const Session = inspector.Session
