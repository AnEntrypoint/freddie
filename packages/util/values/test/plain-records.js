import { hasPlainArrayPrototype, isPlainRecord } from '../src/index.js'

const check = (condition, message) => { if (!condition) throw new Error('plain record check failed: ' + message) }
class Instance {}
const forged = Object.create(null)
Object.defineProperty(forged, 'constructor', { value: function Object() {} })
const forgedProto = Object.create(forged)
const lookalike = Object.create({ constructor: Object })
const Fake = function Object() {}
Object.setPrototypeOf(Fake.prototype, null)
const records = [
  ['literal', {}, true],
  ['literal with keys', { a: 1 }, true],
  ['null prototype', Object.create(null), true],
  ['array', [], false],
  ['null', null, false],
  ['string', 'x', false],
  ['class instance', new Instance(), false],
  ['map', new Map(), false],
  ['prototype with a forged constructor', forgedProto, false],
  ['prototype with the right constructor name but not intrinsic', lookalike, false],
  ['date', new Date(0), false],
  ['prototype whose constructor is a non-native function named Object', Object.create(Fake.prototype), false],
  ['array with a null prototype', Object.setPrototypeOf([], null), false],
]
for (const [name, value, expected] of records) check(isPlainRecord(value) === expected, 'isPlainRecord of ' + name + ' is ' + isPlainRecord(value) + ', expected ' + expected)
const arrays = [
  ['array', [], true],
  ['array of values', [1, 2], true],
  ['array subclass', new (class Sub extends Array {})(), false],
  ['array with a null prototype', Object.setPrototypeOf([], null), false],
  ['array with an object prototype', Object.setPrototypeOf([], {}), false],
]
for (const [name, value, expected] of arrays) check(hasPlainArrayPrototype(value) === expected, 'hasPlainArrayPrototype of ' + name + ' is ' + hasPlainArrayPrototype(value) + ', expected ' + expected)
console.log('values: isPlainRecord and hasPlainArrayPrototype agree on ' + (records.length + arrays.length) + ' cases, forged and subclassed prototypes included')
