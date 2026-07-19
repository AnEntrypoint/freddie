import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintWorld, OUT_OF_BOUNDS_RADIUS, SPAWN_APP_NAMES } from './lint.js'

test('lintWorld: clean world with a spawn-point produces zero findings', () => {
    const entities = [{ id: 'sp1', appName: 'spawn-point', position: [0, 0, 0], children: [] }]
    assert.deepEqual(lintWorld(entities, new Set(['spawn-point'])), [])
})

test('lintWorld: flags a position beyond OUT_OF_BOUNDS_RADIUS as an error', () => {
    const entities = [{ id: 'far', appName: 'placed-model', position: [OUT_OF_BOUNDS_RADIUS + 1, 0, 0], children: [] }]
    const findings = lintWorld(entities, new Set())
    assert.ok(findings.some(f => f.check === 'out-of-bounds' && f.id === 'far' && f.severity === 'error'))
})

test('lintWorld: warns when no spawn-point/respawn-zone entity exists', () => {
    const entities = [{ id: 'x', appName: 'placed-model', position: [0, 0, 0], children: [] }]
    const findings = lintWorld(entities, new Set())
    assert.ok(findings.some(f => f.check === 'missing-spawn' && f.severity === 'warn'))
})

test('lintWorld: respawn-zone also satisfies the spawn check (both SPAWN_APP_NAMES entries)', () => {
    assert.deepEqual([...SPAWN_APP_NAMES].sort(), ['respawn-zone', 'spawn-point'])
    const entities = [{ id: 'rz', appName: 'respawn-zone', position: [0, 0, 0], children: [] }]
    assert.equal(lintWorld(entities, new Set(['respawn-zone'])).some(f => f.check === 'missing-spawn'), false)
})

test('lintWorld: flags a duplicate entity id appearing twice in the tree', () => {
    const entities = [
        { id: 'dup', appName: 'a', position: [0, 0, 0], children: [] },
        { id: 'dup', appName: 'a', position: [1, 1, 1], children: [] },
    ]
    const findings = lintWorld(entities, new Set(['a']))
    assert.ok(findings.some(f => f.check === 'duplicate-id' && f.id === 'dup' && f.severity === 'error'))
})

test('lintWorld: flags an appName absent from the known-app registry', () => {
    const entities = [{ id: 'e', appName: 'nonexistent-app', position: [0, 0, 0], children: [] }]
    const findings = lintWorld(entities, new Set(['some-other-app']))
    assert.ok(findings.some(f => f.check === 'unresolvable-app' && f.id === 'e' && f.severity === 'error'))
})

test('lintWorld: an empty knownAppNames set skips the unresolvable-app check entirely (matches WorldValidator.js semantics)', () => {
    const entities = [{ id: 'e', appName: 'anything', position: [0, 0, 0], children: [] }]
    assert.equal(lintWorld(entities, new Set()).some(f => f.check === 'unresolvable-app'), false)
})

test('lintWorld: walks nested children, not just top-level entities', () => {
    const entities = [{ id: 'root', appName: 'group', position: [0, 0, 0], children: [
        { id: 'nested-far', appName: 'placed-model', position: [OUT_OF_BOUNDS_RADIUS + 1, 0, 0], children: [] },
    ] }]
    const findings = lintWorld(entities, new Set())
    assert.ok(findings.some(f => f.id === 'nested-far' && f.check === 'out-of-bounds'))
})
