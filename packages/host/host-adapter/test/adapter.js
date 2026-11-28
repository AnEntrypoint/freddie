import '@freddie/freddie-runtime/install-fx'
import { Context } from '@freddie/cordis'
import { FxHostContractError, FxUnsupported, createHostAdapter, hostView, planHost, services } from '../src/index.js'
import { CAPABILITY_NAMES, TOOL_NAMES, stubHost } from './stub-host.js'

const results = []
const test = (name, run) => results.push({ name, run })
const check = (condition, message) => { if (!condition) throw new Error(message) }
const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message + ': got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected))
const thrown = (run) => { try { run() } catch (error) { return error } }
const settle = () => new Promise((resolve) => setTimeout(resolve, 15))

async function mount(host, table) {
  const root = new Context()
  const fiber = root.plugin(createHostAdapter(host, table))
  await settle()
  return { root, fiber }
}

const GAPS = ['net.tls']

test('every row whose capability the host reports registers; the gap rows never do', async () => {
  const plan = planHost(stubHost())
  same([...plan.gaps].sort(), [...GAPS].sort(), 'gap rows')
  same(plan.absent, [], 'no reported capability is absent')
  const { root } = await mount(stubHost())
  for (const id of plan.register) check(root.get(services[id].service) !== undefined, id + ' is not registered')
  same(plan.register.length, Object.keys(services).length - GAPS.length, 'registered rows')
  for (const id of GAPS) check(services[id].service === null, id + ' must not name a service')
})

test('a Proxy forwards calls and reads to the host', async () => {
  const host = stubHost()
  const { root } = await mount(host)
  same(root.get('hostFs').existsSync('/missing'), false, 'fs before write')
  root.get('hostFs').writeFileSync('/a', new Uint8Array([1]))
  same(root.get('hostFs').existsSync('/a'), true, 'fs after write')
  same((await root.get('hostFileTools').read_file({ path: 'x' })).text, 'read_file:{"path":"x"}', 'tool result')
  same(root.get('hostVerbs').fs_exists({ path: 'p' }).verb, 'fs_exists', 'verb result')
  same(root.get('hostCrypto').randomBytes(3).length, 3, 'crypto')
  same(root.get('hostProcess').platform, 'stub', 'process reads')
})

test('a Proxy refuses what its capability does not cover', async () => {
  const { root } = await mount(stubHost())
  const error = thrown(() => root.get('hostFileTools').Bash)
  check(error instanceof FxUnsupported && error.code === 'ERR_FX_UNSUPPORTED', 'a shell tool through the file service must throw FxUnsupported')
  check(thrown(() => root.get('hostFs').nope) instanceof FxUnsupported, 'a member the host lacks must throw FxUnsupported')
  check(thrown(() => { root.get('hostFs').existsSync = 1 }) instanceof FxUnsupported, 'assignment must be refused')
  same('Bash' in root.get('hostFileTools'), false, 'has outside the row')
  same(root.get('hostFs').then, undefined, 'await must not see a then member')
})

test('the serve, pty, sqlite, dns and watch views forward to the host and refuse the rest', async () => {
  const host = stubHost()
  const { root } = await mount(host)
  same(root.get('hostServe').serve({ port: 0 }).port, 0, 'serve')
  same(typeof root.get('hostPty').spawn, 'function', 'pty.spawn')
  same(typeof root.get('hostSqlite').open, 'function', 'sqlite.open')
  same((await root.get('hostDns').lookup('a')).address, '127.0.0.1', 'dns.lookup')
  same(typeof root.get('hostWatch').watch, 'function', 'watch.watch')
  check(thrown(() => root.get('hostWatch').existsSync) instanceof FxUnsupported, 'watch must not expose fs members outside its row')
  check(thrown(() => root.get('hostDns').exec) instanceof FxUnsupported, 'dns must not expose members outside its row')
})

test('the net.ws view connects, sends, reads and closes through the host', async () => {
  const { root } = await mount(stubHost())
  const socket = root.get('hostWs').connect('127.0.0.1', 1, '/')
  same(typeof socket.send, 'function', 'send')
  same(typeof socket.recv, 'function', 'recv')
  same(typeof socket.close, 'function', 'close')
  check(thrown(() => root.get('hostWs').listen) instanceof FxUnsupported, 'ws must not expose members outside connect')
})

test('the loader view reloads through the host', async () => {
  const { root } = await mount(stubHost())
  same((await root.get('hostLoader').reload('/a.mjs')).path, '/a.mjs', 'reload')
  check(thrown(() => root.get('hostLoader').load) instanceof FxUnsupported, 'loader must not expose members outside reload')
})

test('the agent views turn and persist through the host', async () => {
  const { root } = await mount(stubHost())
  same(root.get('hostAgent').core.turn('hello'), 'hello', 'turn returns the prompt')
  root.get('hostAgentPersistence').persistence.write('k', { a: 1 })
  same(root.get('hostAgentPersistence').persistence.read('k'), { a: 1 }, 'persistence round trip')
  check(thrown(() => root.get('hostAgent').spawn) instanceof FxUnsupported, 'agent must not expose members outside core')
})

test('the tool rows claim every tool the host reports, and name the one it leaves out', async () => {
  const claimed = Object.values(services).filter((row) => row.source === 'tools').flatMap((row) => row.members)
  same(new Set(claimed).size, claimed.length, 'a tool is claimed twice')
  same(TOOL_NAMES.filter((name) => !claimed.includes(name)), [], 'reported tools no row claims')
  same(claimed.filter((name) => !TOOL_NAMES.includes(name)), ['AgentSwarm'], 'claimed but unreported')
  const { root } = await mount(stubHost())
  same(Object.keys(root.get('hostWebTools')).sort(), ['FetchURL', 'WebSearch'], 'enumerable members')
})

test('a capability the host does not report is not registered, and a dependent plugin does not run', async () => {
  const host = stubHost({ omit: ['fs', 'tools'] })
  const root = new Context()
  const ran = []
  root.plugin({ name: 'needs-fs', inject: ['hostFs'], apply: () => { ran.push('fs') } })
  root.plugin({ name: 'needs-verbs', inject: ['hostVerbs'], apply: () => { ran.push('verbs') } })
  root.plugin(createHostAdapter(host))
  await settle()
  same(root.get('hostFs'), undefined, 'hostFs')
  same(root.get('hostFileTools'), undefined, 'hostFileTools')
  same(ran, ['verbs'], 'dependents that ran')
  const plan = planHost(host)
  same(plan.absent.includes('fs') && plan.absent.includes('tools.file') && plan.absent.includes('tools.shell'), true, 'plan.absent names them')
})

test('an unknown capability is reported and not registered', async () => {
  const host = stubHost({ extraCapabilities: ['future.thing'] })
  check(planHost(host).unknown.includes('future.thing'), 'plan.unknown names it')
  const { root } = await mount(host)
  same(root.get('hostFutureThing'), undefined, 'no service for an unknown id')
})

test('the interface version is checked, and capabilities must be a list', async () => {
  check(thrown(() => planHost(stubHost({ version: { interface: 2 } }))) instanceof FxHostContractError, 'interface 2 must be refused')
  check(thrown(() => planHost({})) instanceof FxHostContractError, 'a host without a version must be refused')
  const host = stubHost()
  host.capabilities = {}
  check(thrown(() => planHost(host)) instanceof FxHostContractError, 'capabilities as an object must be refused')
})

test('a capability reported present without its namespace is a contract error', async () => {
  const host = stubHost()
  delete host.modules.crypto
  const error = thrown(() => planHost(host))
  check(error instanceof FxHostContractError && /crypto/.test(error.message), 'present without a namespace must throw naming it')
})

test('the Proxy reads the host live, so a replaced namespace shows through', async () => {
  const host = stubHost()
  const { root } = await mount(host)
  const view = root.get('hostFs')
  same(view.existsSync('/x'), false, 'before')
  host.modules.fs = { existsSync: () => true }
  same(view.existsSync('/x'), true, 'after the swap')
  delete host.modules.fs
  check(thrown(() => view.existsSync('/x')) instanceof FxUnsupported, 'a removed namespace must refuse')
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
  for (const [id, row] of Object.entries(services)) {
    if (row.capability === null) {
      check(typeof row.reason === 'string' && row.reason.length > 0 && row.service === null, id + ' is a gap with a reason and no service')
    } else {
      check(CAPABILITY_NAMES.includes(row.capability), id + ' names a capability the host lists')
      check(row.service !== null, id + ' must name a service')
    }
  }
  const view = hostView(stubHost(), 'fs', services.fs)
  same(Object.keys(view).sort(), Object.keys(stubHost().modules.fs).sort(), 'enumerated members')
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
