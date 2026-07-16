import { test } from 'node:test'
import assert from 'node:assert/strict'
import { topoSort, validatePlugin } from './contract.js'

test('topoSort: independent plugins keep stable order', () => {
    const plugins = [{ name: 'a', register() {} }, { name: 'b', register() {} }]
    const sorted = topoSort(plugins)
    assert.deepEqual(sorted.map(p => p.name), ['a', 'b'])
})

test('topoSort: dependency is ordered before its dependent', () => {
    const plugins = [
        { name: 'consumer', requires: ['base'], register() {} },
        { name: 'base', register() {} },
    ]
    const sorted = topoSort(plugins)
    const idxBase = sorted.findIndex(p => p.name === 'base')
    const idxConsumer = sorted.findIndex(p => p.name === 'consumer')
    assert.ok(idxBase < idxConsumer, 'base must load before consumer')
})

test('topoSort: throws on a real cycle (a -> b -> a)', () => {
    const plugins = [
        { name: 'a', requires: ['b'], register() {} },
        { name: 'b', requires: ['a'], register() {} },
    ]
    assert.throws(() => topoSort(plugins), /plugin cycle/)
})

test('topoSort: throws when a required dependency is missing entirely', () => {
    const plugins = [{ name: 'a', requires: ['ghost'], register() {} }]
    assert.throws(() => topoSort(plugins), /plugin missing: ghost/)
})

test('validatePlugin: happy path returns the plugin unchanged', () => {
    const p = { name: 'ok', surfaces: 'pi', register() {} }
    assert.equal(validatePlugin(p), p)
})

test('validatePlugin: rejects a plugin missing a name', () => {
    assert.throws(() => validatePlugin({ surfaces: 'pi', register() {} }), /plugin\.name: string required/)
})

test('validatePlugin: rejects an invalid surfaces value', () => {
    assert.throws(() => validatePlugin({ name: 'x', surfaces: 'nope', register() {} }), /surfaces must be one of/)
})

test('validatePlugin: rejects a plugin without a register() function', () => {
    assert.throws(() => validatePlugin({ name: 'x', surfaces: 'pi' }), /register\(ctx\) function required/)
})

test('validatePlugin: rejects requires that is not an array', () => {
    assert.throws(() => validatePlugin({ name: 'x', surfaces: 'pi', requires: 'nope', register() {} }), /requires must be array/)
})
