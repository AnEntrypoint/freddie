import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIVE_WORKSPACE_PACKAGES } from '../src/live-packages.js'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const frameworkRoot = fileURLToPath(new URL('../../../../framework/', import.meta.url))
const requireFromPackage = createRequire(join(packageRoot, 'noop.js'))
const vendored = readdirSync(join(packageRoot, 'vendor', '@freddie'))
const FRAMEWORK_PACKAGES = ['@freddie/cordis', '@freddie/cosmokit', '@freddie/cordis-plugin-loader']

for (const name of FRAMEWORK_PACKAGES) {
  const short = name.slice('@freddie/'.length)
  assert.ok(LIVE_WORKSPACE_PACKAGES.has(name), name + ' is served live')
  assert.ok(requireFromPackage.resolve(name + '/src/index.js').startsWith(frameworkRoot), name + ' resolves from framework/')
  assert.deepEqual(vendored.filter((entry) => entry.startsWith(short + '@')), [], name + ' has no vendored copy')
}
console.log('live-packages: ' + FRAMEWORK_PACKAGES.length + ' framework packages served from framework/, none vendored')
