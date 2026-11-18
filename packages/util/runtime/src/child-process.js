import { activeRuntime } from './runtime.js'

const { childProcess } = activeRuntime()

export const execFile = childProcess.execFile
export const execFileSync = childProcess.execFileSync
export const spawn = childProcess.spawn
export const spawnSync = childProcess.spawnSync
