import { Context, Service } from '@freddie/cordis'

export {
  FsError,
  FsTargetKey,
  FsVersion,
} from './types.js'

export class FileSystem extends Service {
  constructor(ctx) {
    super(ctx, 'fs')
  }

  get sandboxMode() {
    return undefined
  }

  resolve(path, opts) {
    throw new Error('not implemented')
  }

  processPath(target) {
    throw new Error('not implemented')
  }

  fileUrl(target) {
    throw new Error('not implemented')
  }

  contains(parent, child) {
    throw new Error('not implemented')
  }

  stat(target, signal) {
    throw new Error('not implemented')
  }

  lstat(path, opts, signal) {
    throw new Error('not implemented')
  }

  readText(target, signal) {
    throw new Error('not implemented')
  }

  streamText(target, signal) {
    throw new Error('not implemented')
  }

  readBytes(target, signal, maxBytes) {
    throw new Error('not implemented')
  }

  listDir(target, signal) {
    throw new Error('not implemented')
  }

  writeText(target, content, expected, signal, sandboxPolicy) {
    throw new Error('not implemented')
  }

  editText(target, edit, expected, signal, sandboxPolicy) {
    throw new Error('not implemented')
  }
}

export default FileSystem
