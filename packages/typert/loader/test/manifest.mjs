import '@freddie/freddie-runtime/install-fx'
import { execFileSync } from 'node:child_process'
import { validateTypertManifest } from '../src/index.js'

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() + '/'
const check = (condition, message) => { if (!condition) throw new Error('typert manifest check failed: ' + message) }
const refused = (manifest, fragment, why) => {
  try { validateTypertManifest('@freddie/pkg', manifest) } catch (error) { check(error.message.includes(fragment), why + ': message ' + error.message); return }
  throw new Error('typert manifest check failed: ' + why + ': accepted')
}
const minimal = { package: '@freddie/pkg', face: 'host', schemas: [], invocations: [] }
check(validateTypertManifest('@freddie/pkg', minimal) === minimal, 'a manifest with no model validates')
refused({ ...minimal, package: '@freddie/other' }, 'must be owned by the package', 'a manifest naming another package')
refused({ ...minimal, face: 'client' }, 'face is not "host"', 'a client face')
refused({ ...minimal, schemas: {} }, 'schemas must be an array', 'schemas that are not an array')
refused({ ...minimal, invocations: undefined }, 'invocations must be an array', 'no invocations')
const files = execFileSync('git', ['ls-files', '*typert.host.js'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
for (const file of files) {
  const { TYPERT } = await import(ROOT + file)
  check(!('model' in TYPERT), file + ' still carries a model')
  validateTypertManifest(TYPERT.package, TYPERT)
}
console.log('typert loader: minimal, wrong-package, wrong-face, bad-schemas and missing-invocations manifests behave; all ' + files.length + ' host manifests validate with no model')
