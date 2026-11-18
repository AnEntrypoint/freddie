import { activeRuntime } from './runtime.js'

const { fs } = activeRuntime()

export const accessSync = fs.accessSync
export const closeSync = fs.closeSync
export const constants = fs.constants
export const createReadStream = fs.createReadStream
export const existsSync = fs.existsSync
export const lstatSync = fs.lstatSync
export const mkdirSync = fs.mkdirSync
export const mkdtempSync = fs.mkdtempSync
export const openSync = fs.openSync
export const readFileSync = fs.readFileSync
export const readSync = fs.readSync
export const readdirSync = fs.readdirSync
export const readlinkSync = fs.readlinkSync
export const realpathSync = fs.realpathSync
export const rmSync = fs.rmSync
export const statSync = fs.statSync
export const symlinkSync = fs.symlinkSync
export const unlinkSync = fs.unlinkSync
export const unwatchFile = fs.unwatchFile
export const watchFile = fs.watchFile
export const writeFileSync = fs.writeFileSync
export const writeSync = fs.writeSync
