import { activeRuntime } from './runtime.js'

const { vm } = activeRuntime()

export const Script = vm.Script
export const createContext = vm.createContext
export const runInContext = vm.runInContext
