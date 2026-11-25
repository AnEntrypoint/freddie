import host from 'fx:host'
import { planHost, hostView, services } from '../src/index.js'
import { CAPABILITY_NAMES, MODULE_NAMES, TOOL_NAMES, VERB_NAMES, stubHost } from '../test/stub-host.js'

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
const sorted = (list) => [...list].sort()
const live = planHost(host)
const modeled = planHost(stubHost())
const checks = [
  ['interface 1', host.version.interface === 1],
  ['capabilities', same(sorted(host.capabilities), sorted(CAPABILITY_NAMES))],
  ['tools', same(sorted(Object.keys(host.tools)), sorted(TOOL_NAMES))],
  ['verbs', same(sorted(Object.keys(host.verbs)), sorted(VERB_NAMES))],
  ['modules', same(sorted(Object.keys(host.modules)), sorted(MODULE_NAMES))],
  ['register matches the model', same(live.register, modeled.register)],
  ['gaps match the model', same(live.gaps, modeled.gaps)],
  ['absent matches the model', same(live.absent, modeled.absent)],
  ['unknown matches the model', same(live.unknown, modeled.unknown)],
  ['fs view reads the live module', typeof hostView(host, 'fs', services.fs).readFileSync === 'function'],
  ['tool view names the live tool', typeof hostView(host, 'hostWebTools', services['tools.web']).FetchURL === 'function'],
]
for (const [name, ok] of checks) console.log((ok ? 'ok   ' : 'FAIL ') + name)
if (checks.some(([, ok]) => !ok)) throw new Error('fx live check failed')
console.log('register ' + live.register.length + ' gaps ' + live.gaps.length + ' absent ' + live.absent.length + ' unknown ' + live.unknown.length)
