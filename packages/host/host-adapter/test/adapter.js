import '@freddie/freddie-runtime/install-node'
import { Context } from '@freddie/cordis'
import { FxHostContractError, FxUnsupported, createHostAdapter, hostView, planHost, services } from '../src/index.js'
import { CAPABILITY_NAMESPACE, TOOL_NAMES, stubHost } from './stub-host.js'

const results = []
const test = (name, run) => results.push({ name, run })
const check = (condition, message) => { if (!condition) throw new Error(message) }
const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message + ': got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected))
const thrown = (run) => { try { run() } catch (error) { return error } }
const rejected = async (run) => { try { await run() } catch (error) { return error } }
const settle = () => new Promise((resolve) => setTimeout(resolve, 15))

async function mount(host, table) {
  const root = new Context()
  const fiber = root.plugin(createHostAdapter(host, table))
  await settle()
  return { root, fiber }
}

test('every capability with a service registers, and the two flag capabilities do not', async () => {
  const { root } = await mount(stubHost())
  const wanted = Object.values(services).filter((row) => row.service !== null).map((row) => row.service)
  for (const name of wanted) check(root.get(name) !== undefined, name + ' is not registered')
  same(wanted.length, 21, 'service count')
  same(Object.entries(services).filter(([, row]) => row.service === null).map(([id]) => id), ['net.tls', 'net.ws'], 'flag capabilities')
})

test('a Proxy forwards calls and reads to the host', async () => {
  const host = stubHost()
  const { root } = await mount(host)
  same(await root.get('hostFs').exists('/missing'), false, 'fs.exists before write')
  await root.get('hostFs').writeFile('/a', new Uint8Array([1]))
  same(await root.get('hostFs').exists('/a'), true, 'fs.exists after write')
  same((await root.get('hostFileTools').read_file({ path: 'x' })).text, 'read_file:{"path":"x"}', 'tool result')
  same((await root.get('hostFetch')('http://x')).url, 'http://x', 'callable fetch')
  same(typeof root.get('hostAgent')({ name: 'a' }).close, 'function', 'callable agent')
  same(typeof root.get('hostAgent').hooks.on, 'function', 'agent.hooks')
  same(await root.get('hostAgentPersistence').sessions.list(), [{ id: 's1' }], 'agent sessions')
  same(root.get('hostProc').info().platform, 'stub', 'proc.info')
})

test('a Proxy refuses what its capability does not cover', async () => {
  const { root } = await mount(stubHost())
  const error = thrown(() => root.get('hostFileTools').Bash)
  check(error instanceof FxUnsupported && error.code === 'ERR_FX_UNSUPPORTED', 'a shell tool through the file service must throw FxUnsupported')
  check(thrown(() => root.get('hostFs').nope) instanceof FxUnsupported, 'a member the host lacks must throw FxUnsupported')
  same(thrown(() => root.get('hostFs')('x'))?.name, 'TypeError', 'a non-callable namespace must refuse a call')
  check(thrown(() => { root.get('hostFs').exists = 1 }) instanceof FxUnsupported, 'assignment must be refused')
  same(thrown(() => root.get('hostAgentPersistence')())?.name, 'TypeError', 'a subset service must not be callable')
  same(root.get('hostFs').then, undefined, 'await must not see a then member')
})

test('the tools capabilities partition the tools namespace exactly', async () => {
  const claimed = Object.values(services).filter((row) => row.namespace === 'tools').flatMap((row) => row.members)
  same([...claimed].sort(), [...TOOL_NAMES].sort(), 'claimed tool names')
  same(new Set(claimed).size, claimed.length, 'a tool is claimed twice')
  const { root } = await mount(stubHost())
  same(root.get('hostBrowserTools').$list().map((entry) => entry.name), ['Browser'], 'filtered $list')
  same(Object.keys(root.get('hostWebTools')).sort(), ['FetchURL', 'WebSearch'], 'enumerable members')
})

test('a capability the host does not report is not registered, and a dependent plugin does not run', async () => {
  const host = stubHost({ omit: ['sqlite', 'watch', 'tools.browser'] })
  const root = new Context()
  const ran = []
  root.plugin({ name: 'needs-sqlite', inject: ['hostSqlite'], apply: () => { ran.push('sqlite') } })
  root.plugin({ name: 'needs-fs', inject: ['hostFs'], apply: () => { ran.push('fs') } })
  root.plugin(createHostAdapter(host))
  await settle()
  same(root.get('hostSqlite'), undefined, 'hostSqlite')
  same(root.get('hostWatch'), undefined, 'hostWatch')
  same(root.get('hostBrowserTools'), undefined, 'hostBrowserTools')
  same(ran, ['fs'], 'dependents that ran')
  same(planHost(host).absent.sort(), ['sqlite', 'tools.browser', 'watch'], 'plan.absent')
})

test('an unknown capability is reported and not registered', async () => {
  const host = stubHost({ extraCapabilities: { 'future.thing': { present: true, since: 2, status: 'planned' } } })
  same(planHost(host).unknown, ['future.thing'], 'plan.unknown')
  const { root } = await mount(host)
  same(root.get('hostFutureThing'), undefined, 'no service for an unknown id')
})

test('the interface version is checked', async () => {
  check(thrown(() => planHost(stubHost({ version: { interface: 2 } }))) instanceof FxHostContractError, 'interface 2 must be refused')
  check(thrown(() => planHost({})) instanceof FxHostContractError, 'a host without a version must be refused')
})

test('a capability reported present without its namespace is a contract error', async () => {
  const host = stubHost()
  delete host.crypto
  const error = thrown(() => planHost(host))
  check(error instanceof FxHostContractError && /crypto/.test(error.message), 'present without a namespace must throw naming it')
})

test('the Proxy reads the host live, so a replaced namespace shows through', async () => {
  const host = stubHost()
  const { root } = await mount(host)
  const view = root.get('hostDns')
  same((await view.lookup('a'))[0].address, '127.0.0.1', 'before')
  host.dns = { lookup: async () => [{ address: '10.0.0.1', family: 4 }] }
  same((await view.lookup('a'))[0].address, '10.0.0.1', 'after the swap')
  delete host.dns
  check((await rejected(() => view.lookup('a'))) instanceof FxUnsupported, 'a removed namespace must refuse')
})

test('disposing the adapter removes every service', async () => {
  const { root, fiber } = await mount(stubHost())
  check(root.get('hostFs') !== undefined, 'registered before dispose')
  fiber.dispose()
  await settle()
  same(root.get('hostFs'), undefined, 'hostFs after dispose')
  same(root.get('hostFileTools'), undefined, 'hostFileTools after dispose')
})

test('the table is consistent with the host shape', async () => {
  const names = Object.values(services).filter((row) => row.service !== null).map((row) => row.service)
  same(new Set(names).size, names.length, 'service names are unique')
  same(Object.keys(services).sort(), Object.keys(CAPABILITY_NAMESPACE).sort(), 'table ids against the host capability ids')
  for (const [id, row] of Object.entries(services)) same(row.service === null ? null : row.namespace, CAPABILITY_NAMESPACE[id], id + ' namespace')
  const view = hostView(stubHost(), 'fs', services.fs)
  same(Object.keys(view).sort(), Object.keys(stubHost().fs).sort(), 'enumerated members')
})

const failed = []
for (const { name, run } of results) {
  try {
    await run()
    console.log('ok   ' + name)
  } catch (error) {
    failed.push(name)
    console.log('FAIL ' + name + ': ' + error.message)
  }
}
console.log('host-adapter: ' + (results.length - failed.length) + '/' + results.length + ' cases pass')
if (failed.length > 0) throw new Error('host-adapter failed: ' + failed.join('; '))
