import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { capture } from './process.js'

export const PUBLISH_ORDER_FILE = 'publish-order.txt'

export function tarballFiles(tarball) {
  return capture('tar', ['-tzf', tarball]).split('\n').filter(line => line !== '')
}

export function packedIdentity(tarball) {
  const manifest = JSON.parse(capture('tar', ['-xOzf', tarball, 'package/package.json']))
  if (manifest === null || typeof manifest !== 'object') throw new Error(`${tarball} has no manifest`)
  const { name, version } = manifest
  if (typeof name !== 'string' || typeof version !== 'string') throw new Error(`${tarball} manifest lacks name/version`)
  return { name, version }
}

export function readPublishOrder(directory) {
  return readFileSync(join(directory, PUBLISH_ORDER_FILE), 'utf8').split('\n').filter(line => line !== '')
}
