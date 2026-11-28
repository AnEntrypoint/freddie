import '../src/install-fx.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { captureCases, fixtureProblems } from './parity-cases.js'

const FIXTURE = new URL('./parity-fixture.json', import.meta.url)
const CASES = new URL('./parity-cases.js', import.meta.url)
const HARDCODED_TMP = /mkdtemp\w*\(\s*['"`]\/tmp/

const lineOf = (entry) => '  ' + JSON.stringify(entry)
const serialized = (fixture) => '{"version":1,"runtime":"node","shared":[\n' + fixture.shared.map(lineOf).join(',\n') + '\n],"gaps":[\n' + fixture.gaps.map(lineOf).join(',\n') + '\n]}\n'

const writing = process.argv.includes('--write')
process.argv.splice(2)

const captured = await captureCases()

if (writing) {
  const again = await captureCases()
  const unstable = captured.shared.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(again.shared[index])).map((entry) => entry.name)
  if (unstable.length > 0) throw new Error('parity-fixture: these cases gave different output on two runs: ' + unstable.join('; '))
  writeFileSync(FIXTURE, serialized(captured))
  console.log('parity-fixture: wrote ' + captured.shared.length + ' shared cases and ' + captured.gaps.length + ' gap cases')
} else {
  const problems = fixtureProblems(JSON.parse(readFileSync(FIXTURE, 'utf8')), captured)
  if (HARDCODED_TMP.test(readFileSync(CASES, 'utf8'))) problems.push('parity-cases.js creates a scratch directory under a hardcoded /tmp; build it from s.os.tmpdir()')
  if (problems.length > 0) throw new Error('parity-fixture: ' + problems.length + ' problem(s)\n' + problems.slice(0, 20).join('\n'))
  console.log('parity-fixture: ' + captured.shared.length + ' shared cases and ' + captured.gaps.length + ' gap cases match the fixture; every case is present; scratch follows TMPDIR')
}
