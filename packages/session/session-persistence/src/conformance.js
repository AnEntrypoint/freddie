import { Context } from '@freddie/cordis'
import { SESSION_FORMAT_VERSION, SessionStore } from '@freddie/freddie-session'

const TIME = 1700000000100

const header = (id, extra = {}) => ({ version: SESSION_FORMAT_VERSION, id, cwd: '/proj/conformance', createdAt: 1700000000000, delegationDepth: 0, ...extra })
const start = (seq, turn) => ({ seq, time: TIME, type: 'turn/start', data: { turn } })
const end = (seq, turn) => ({ seq, time: TIME, type: 'turn/end', data: { turn, reason: { kind: 'interrupted' } } })
const closedTurn = (seq, turn) => [start(seq, turn), end(seq + 1, turn)]
const signature = events => events.map(event => `${event.seq}:${event.type}`)
const plain = value => JSON.parse(JSON.stringify(value))
const stored = events => plain(events.map(({ seq, time, type, data }) => ({ seq, time, type, data })))
const check = (condition, message) => {
  if (!condition) throw new Error(message)
}
const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
const rejected = async (operation) => {
  try {
    await operation()
  } catch (error) {
    return error
  }
  return undefined
}

const CASES = [
  {
    name: 'a session with events is listed with its header',
    async run({ open }) {
      const { persistence } = await open()
      const meta = header('a')
      await persistence.create(meta)
      await persistence.append('a', closedTurn(0, 1))
      const found = (await persistence.list()).find(entry => entry.id === 'a')
      check(found !== undefined, 'the session is listed once it has events')
      same([found.cwd, found.createdAt], [meta.cwd, meta.createdAt], 'the listed header keeps cwd and creation time')
    },
  },
  {
    name: 'append needs contiguous sequence numbers: a gap, a repeat, a step back and a hole in a batch are rejected and change nothing',
    async run({ open }) {
      const { persistence } = await open()
      await persistence.create(header('a'))
      await persistence.append('a', closedTurn(0, 1))
      await persistence.append('a', closedTurn(2, 2))
      check(await rejected(() => persistence.append('a', closedTurn(9, 3))) !== undefined, 'a gap in seq is rejected')
      check(await rejected(() => persistence.append('a', closedTurn(2, 3))) !== undefined, 'a repeated seq is rejected')
      check(await rejected(() => persistence.append('a', closedTurn(0, 3))) !== undefined, 'a seq that steps back is rejected')
      check(await rejected(() => persistence.append('a', [start(4, 3), end(6, 3)])) !== undefined, 'a hole inside one batch is rejected')
      same(signature((await persistence.load('a')).events), ['0:turn/start', '1:turn/end', '2:turn/start', '3:turn/end'], 'rejected batches leave the log unchanged')
    },
  },
  {
    name: 'an append that resolved is durable: a new backend over the same storage after an abandon reads every event back unchanged',
    async run({ open }) {
      const first = await open()
      await first.persistence.create(header('a'))
      const events = [...closedTurn(0, 1), ...closedTurn(2, 2)]
      await first.persistence.append('a', events)
      await first.abandon()
      const second = await open()
      same(stored((await second.persistence.load('a')).events), events, 'the stored events')
    },
  },
  {
    name: 'an append that resolved survives the process dying right after it',
    needs: 'crashAfterAppend',
    async run({ open, storage }) {
      const batches = [closedTurn(0, 1), closedTurn(2, 2), closedTurn(4, 3)]
      await storage.crashAfterAppend(header('a'), batches)
      const backend = await open()
      same(stored((await backend.persistence.load('a')).events), batches.flat(), 'the stored events')
    },
  },
  {
    name: 'load closes an interrupted turn instead of truncating it, and the closer is durable',
    async run({ open }) {
      const first = await open()
      await first.persistence.create(header('a'))
      await first.persistence.append('a', [start(0, 1)])
      const loaded = await first.persistence.load('a')
      same(signature(loaded.events), ['0:turn/start', '1:turn/end'], 'the open turn gets a closer after the stored event')
      same(loaded.events[1].data.turn, 1, 'the closer names the open turn')
      await first.abandon()
      const second = await open()
      same(signature((await second.persistence.load('a')).events), ['0:turn/start', '1:turn/end'], 'the closer survives a restart')
      await second.persistence.append('a', closedTurn(2, 2))
      same(signature((await second.persistence.load('a')).events), ['0:turn/start', '1:turn/end', '2:turn/start', '3:turn/end'], 'the log continues after the closer')
    },
  },
  {
    name: 'a torn final record is dropped, the records before it survive, and the log stays contiguous and balanced',
    needs: 'tearTail',
    async run({ open }) {
      const first = await open()
      const meta = header('a')
      await first.persistence.create(meta)
      await first.persistence.append('a', [...closedTurn(0, 1), ...closedTurn(2, 2)])
      await first.abandon()
      await first.tearTail(meta)
      const second = await open()
      const loaded = await second.persistence.load('a')
      check(loaded.events.every((event, index) => event.seq === index), 'seq stays contiguous from zero')
      same(signature(loaded.events.slice(0, 3)), ['0:turn/start', '1:turn/end', '2:turn/start'], 'the records before the torn one survive')
      same(loaded.events.at(-1).type, 'turn/end', 'the interrupted turn is closed')
      await second.persistence.append('a', closedTurn(loaded.events.length, 3))
    },
  },
  {
    name: 'list covers every session, and listSnapshots carries a revision that changes only when that log changes',
    async run({ open }) {
      const { persistence } = await open()
      await persistence.create(header('a'))
      await persistence.create(header('b'))
      await persistence.append('a', closedTurn(0, 1))
      await persistence.append('b', closedTurn(0, 1))
      same((await persistence.list()).map(entry => entry.id).sort(), ['a', 'b'], 'list names both sessions')
      const before = await persistence.listSnapshots()
      const revision = id => before.find(snapshot => snapshot.header.id === id)?.revision
      check(revision('a') !== undefined && revision('b') !== undefined, 'every snapshot has a revision')
      const again = await persistence.listSnapshots()
      same(again.map(snapshot => snapshot.revision), before.map(snapshot => snapshot.revision), 'revisions are stable while nothing changes')
      await persistence.append('a', closedTurn(2, 2))
      const after = await persistence.listSnapshots()
      const revisionAfter = id => after.find(snapshot => snapshot.header.id === id)?.revision
      check(JSON.stringify(revisionAfter('a')) !== JSON.stringify(revision('a')), 'the revision of the appended log changes')
      same(revisionAfter('b'), revision('b'), 'the revision of the other log does not')
    },
  },
  {
    name: 'readFrom(id, seq) returns the events from seq on, an empty list at or past the end, and does not change the log',
    async run({ open }) {
      const { persistence } = await open()
      await persistence.create(header('a'))
      await persistence.append('a', [...closedTurn(0, 1), ...closedTurn(2, 2), ...closedTurn(4, 3)])
      const tail = await persistence.readFrom('a', 3)
      same(signature(tail.events), ['3:turn/end', '4:turn/start', '5:turn/end'], 'the suffix from seq 3')
      same(tail.meta.id, 'a', 'readFrom returns the header')
      same((await persistence.readFrom('a', 0)).events.length, 6, 'seq 0 returns the whole log')
      same((await persistence.readFrom('a', 6)).events, [], 'at the end')
      same((await persistence.readFrom('a', 99)).events, [], 'past the end')
      same((await persistence.load('a')).events.length, 6, 'reading a suffix leaves the log as it was')
    },
  },
  {
    name: 'a fork keeps its parent link and seed length, holds the seed prefix, and its log is independent of the parent log',
    async run({ open }) {
      const { persistence } = await open()
      await persistence.create(header('a'))
      await persistence.append('a', [...closedTurn(0, 1), ...closedTurn(2, 2)])
      const seed = stored((await persistence.load('a')).events.slice(0, 2))
      await persistence.create(header('b', { parentSession: 'a', seedLength: seed.length }))
      await persistence.append('b', seed)
      await persistence.append('b', closedTurn(2, 5))
      const child = await persistence.load('b')
      same([child.meta.parentSession, child.meta.seedLength], ['a', 2], 'the child header')
      same(signature(child.events), ['0:turn/start', '1:turn/end', '2:turn/start', '3:turn/end'], 'the child log')
      same(child.events[3].data.turn, 5, 'the child continues with its own turn')
      await persistence.append('a', closedTurn(4, 3))
      same((await persistence.load('b')).events.length, 4, 'appending to the parent does not change the child')
      same((await persistence.load('a')).events.length, 6, 'appending to the child did not change the parent')
    },
  },
]

export const CONFORMANCE_CASES = CASES.map(({ name, needs }) => ({ name, needs }))

export async function runConformance({ name, newStorage, report = console.log }) {
  const results = []
  for (const testCase of CASES) {
    if (testCase.needs !== undefined) {
      const probe = await newStorage()
      const backend = await probe.open(contextWithStore())
      const supported = typeof (testCase.needs === 'tearTail' ? backend : probe)[testCase.needs] === 'function'
      await probe.cleanup()
      if (!supported) {
        results.push({ name: testCase.name, skipped: true })
        report(`skip ${testCase.name} (the harness has no ${testCase.needs})`)
        continue
      }
    }
    const storage = await newStorage()
    const open = async () => storage.open(contextWithStore())
    try {
      await testCase.run({ open, storage })
      results.push({ name: testCase.name, passed: true })
      report(`ok   ${testCase.name}`)
    } catch (error) {
      results.push({ name: testCase.name, passed: false, error: String(error?.message ?? error) })
      report(`FAIL ${testCase.name}: ${String(error?.message ?? error)}`)
    } finally {
      await storage.cleanup()
    }
  }
  const failed = results.filter(result => result.passed === false)
  const skipped = results.filter(result => result.skipped === true)
  report(`${name} session-persistence conformance: ${results.length - failed.length - skipped.length}/${results.length - skipped.length} cases pass, ${skipped.length} skipped`)
  if (failed.length > 0) throw new Error(`${name} session-persistence conformance failed: ${failed.map(result => result.name).join('; ')}`)
  return results
}

function contextWithStore() {
  const ctx = new Context()
  new SessionStore(ctx)
  return ctx
}
