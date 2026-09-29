import { HarnessError } from '@freddie/freddie-llm'

export function FsTargetKey(key) {
  return key
}

export function FsVersion(v) {
  return v
}

export class FsError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.code = code
  }
}
