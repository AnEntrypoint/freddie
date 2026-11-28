import { activeRuntime } from './runtime.js'

const { pty } = activeRuntime()

export const spawn = pty.spawn
