import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCron, matches } from './cron-parse.js'

test('parseCron: "* * * * *" matches every minute/hour/day', () => {
    const parsed = parseCron('* * * * *')
    assert.equal(matches(parsed, new Date(2026, 0, 1, 13, 37)), true)
    assert.equal(matches(parsed, new Date(2026, 5, 15, 0, 0)), true)
})

test('parseCron: fixed fields only match the exact value', () => {
    const parsed = parseCron('30 9 * * *') // 09:30 every day
    assert.equal(matches(parsed, new Date(2026, 2, 3, 9, 30)), true)
    assert.equal(matches(parsed, new Date(2026, 2, 3, 9, 31)), false)
    assert.equal(matches(parsed, new Date(2026, 2, 3, 10, 30)), false)
})

test('parseCron: step and range syntax ("*/15" and "1-5")', () => {
    const parsed = parseCron('*/15 * 1-5 * *') // every 15 min, on days 1-5 of the month
    assert.equal(matches(parsed, new Date(2026, 3, 3, 12, 0)), true)
    assert.equal(matches(parsed, new Date(2026, 3, 3, 12, 15)), true)
    assert.equal(matches(parsed, new Date(2026, 3, 3, 12, 10)), false)
    assert.equal(matches(parsed, new Date(2026, 3, 6, 12, 0)), false, 'day 6 is outside the 1-5 range')
})

test('parseCron: throws on malformed input with wrong field count', () => {
    assert.throws(() => parseCron('* * * *'), /cron must have 5 fields/)
    assert.throws(() => parseCron('* * * * * *'), /cron must have 5 fields/)
})
