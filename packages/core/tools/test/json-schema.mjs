import '@freddie/freddie-runtime/install-fx'
import { assertSupportedJsonSchema } from '../src/index.js'

const check = (condition, message) => { if (!condition) throw new Error('json schema check failed: ' + message) }
const verdict = (schema) => { try { assertSupportedJsonSchema(schema); return 'accepted' } catch (error) { return error.code ?? error.name } }
class Instance { constructor() { this.type = 'string' } }
const forgedPrototype = Object.create({ constructor: Object })
forgedPrototype.type = 'string'
const cases = [
  ['a string schema', { type: 'string' }, 'accepted'],
  ['an object schema', { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }, 'accepted'],
  ['a null-prototype schema', Object.assign(Object.create(null), { type: 'string' }), 'accepted'],
  ['a class instance', new Instance(), 'UNSUPPORTED_SCHEMA'],
  ['a schema with a forged prototype', forgedPrototype, 'UNSUPPORTED_SCHEMA'],
  ['an enum that is an array subclass', { enum: Object.assign(new (class Sub extends Array {})(), ['a']) }, 'UNSUPPORTED_SCHEMA'],
  ['an unknown keyword', { type: 'string', pattern: 'x' }, 'UNSUPPORTED_SCHEMA'],
]
for (const [name, schema, expected] of cases) check(verdict(schema) === expected, name + ': ' + verdict(schema) + ', expected ' + expected)
console.log('tools json schema: ' + cases.length + ' schemas, plain, null-prototype, forged and subclassed ones, get the same verdicts')
