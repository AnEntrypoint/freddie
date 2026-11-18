import { realpath } from '@freddie/freddie-runtime/fs-promises'

export async function realpathNormalize(path) {
  return await realpath(path)
}
