import { activeRuntime } from './runtime.js'

const { fsPromises } = activeRuntime()

export const access = fsPromises.access
export const chmod = fsPromises.chmod
export const constants = fsPromises.constants
export const cp = fsPromises.cp
export const link = fsPromises.link
export const lstat = fsPromises.lstat
export const mkdir = fsPromises.mkdir
export const mkdtemp = fsPromises.mkdtemp
export const open = fsPromises.open
export const opendir = fsPromises.opendir
export const readFile = fsPromises.readFile
export const readdir = fsPromises.readdir
export const realpath = fsPromises.realpath
export const rename = fsPromises.rename
export const rm = fsPromises.rm
export const stat = fsPromises.stat
export const truncate = fsPromises.truncate
export const unlink = fsPromises.unlink
export const writeFile = fsPromises.writeFile
