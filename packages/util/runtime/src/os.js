import { activeRuntime } from './runtime.js'

const { os } = activeRuntime()

export const availableParallelism = os.availableParallelism
export const constants = os.constants
export const homedir = os.homedir
export const networkInterfaces = os.networkInterfaces
export const platform = os.platform
export const release = os.release
export const tmpdir = os.tmpdir
