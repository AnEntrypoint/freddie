import { activeRuntime } from './runtime.js'

const { module } = activeRuntime()

export const createRequire = module.createRequire
export const stripTypeScriptTypes = module.stripTypeScriptTypes
