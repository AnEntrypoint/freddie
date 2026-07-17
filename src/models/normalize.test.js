import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeModel, listAliases } from './normalize.js'

test('normalizeModel: resolves a known alias', () => {
    assert.equal(normalizeModel('sonnet'), 'claude-sonnet-4-6')
    assert.equal(normalizeModel('opus'), 'claude-opus-4-7')
})

test('normalizeModel: is case-insensitive; hyphens are preserved (not stripped) before lookup', () => {
    assert.equal(normalizeModel('Sonnet'), 'claude-sonnet-4-6')
    // lowercasing "GPT-5" keeps the hyphen ("gpt-5"), which does NOT match the
    // "gpt5" alias key, so it passes through unchanged (case-normalized only).
    assert.equal(normalizeModel('GPT-5'), 'GPT-5')
    assert.equal(normalizeModel('gpt5'), 'gpt-5') // no hyphen -> matches the alias
})

test('normalizeModel: passes through an unknown model id unchanged', () => {
    assert.equal(normalizeModel('some-custom-model-id'), 'some-custom-model-id')
})

test('normalizeModel: edge case — falsy/empty input returns null', () => {
    assert.equal(normalizeModel(''), null)
    assert.equal(normalizeModel(null), null)
    assert.equal(normalizeModel(undefined), null)
})

test('listAliases: returns a copy, not the live alias table', () => {
    const a = listAliases()
    assert.equal(a.sonnet, 'claude-sonnet-4-6')
    a.sonnet = 'tampered'
    assert.equal(normalizeModel('sonnet'), 'claude-sonnet-4-6', 'mutating the returned object must not affect future lookups')
})
