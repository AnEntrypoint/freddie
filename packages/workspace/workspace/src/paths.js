import { realpath } from 'node:fs/promises'

export async function realpathNormalize(path) {
  return await realpath(path)
}
