import assert from 'node:assert/strict'
import { apiQueries } from '../src/index.js'

const types = [
  { name: 'Abc', declaration: 'type Abc = string' },
  { name: 'Ab', declaration: 'type Ab = number' },
  { name: 'Dep', declaration: 'interface Dep { a: Abc }' },
  { name: 'Q$', declaration: 'type Q$ = boolean' },
  { name: 'Unused', declaration: 'type Unused = null' },
]
const services = [
  { key: 'a-b', summary: 'summary', description: 'description', methods: [{ signature: 'f(x: Abc): Dep' }, { signature: 'g(y: Ab2): void' }] },
  { key: 'plain', summary: 'summary', description: 'description', methods: [{ signature: 'h(q: Q$): void' }] },
]
const events = [{ name: 'changed', summary: 'changed', description: 'changed event', mode: 'sync', signature: 'changed(payload: Dep): void', parameters: [] }]
const { queryServiceApi, queryEventApi } = apiQueries({ services, events, types })

assert.deepEqual(queryServiceApi('a-b').referencedTypes.map(t => t.name), ['Abc', 'Dep'], 'closure follows whole identifiers, transitively, in catalogue order')
assert.deepEqual(queryServiceApi('plain').referencedTypes.map(t => t.name), ['Q$'], 'a type name with a dollar sign is matched literally')
assert.deepEqual(queryEventApi('changed').referencedTypes.map(t => t.name), ['Abc', 'Dep'], 'an event closure starts from its signature')
assert.equal(queryServiceApi('a-b').service.access.hardDependency.expression, 'ctx["a-b"]', 'a key that is not an identifier is read by index')
assert.equal(queryServiceApi('plain').service.access.hardDependency.expression, 'ctx.plain', 'an identifier key is read by property')
assert.equal(queryServiceApi('plain').service.access.optional.expression, 'ctx.get("plain")')
assert.deepEqual(queryServiceApi().services.map(s => s.key), ['a-b', 'plain'], 'the catalogue mode lists the services')
assert.deepEqual(queryEventApi().events.map(e => e.name), ['changed'], 'the event catalogue mode lists the events')
assert.throws(() => queryServiceApi('missing'), /no catalogued Service named "missing"/)
assert.throws(() => queryEventApi('missing'), /no catalogued Event named "missing"/)
assert.equal(queryServiceApi('plain', [services[1]]).service.key, 'plain', 'a list passed in is searched instead of the bound one')
console.log('api-catalog: 11 assertions on a fixture catalogue hold')
