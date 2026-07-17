import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyUnifiedDiff } from './patch_parser.js'

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'freddie-patch-parser-'))
}

test('applyUnifiedDiff: happy path applies a single-hunk diff to an existing file', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n')
    const diff = [
        '--- a.txt',
        '+++ a.txt',
        '@@ -1,3 +1,3 @@',
        ' line1',
        '-line2',
        '+line2-CHANGED',
        ' line3',
    ].join('\n')
    const results = applyUnifiedDiff(diff, { cwd: dir })
    assert.equal(results.length, 1)
    assert.equal(results[0].file, 'a.txt')
    assert.equal(results[0].applied, 1)
    const contents = fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')
    assert.match(contents, /line2-CHANGED/)
    assert.doesNotMatch(contents, /^line2$/m)
})

test('applyUnifiedDiff: edge case — target file does not exist reports an error result, does not throw', () => {
    const dir = tmpDir()
    const diff = ['--- missing.txt', '+++ missing.txt', '@@ -1,1 +1,1 @@', '-x', '+y'].join('\n')
    const results = applyUnifiedDiff(diff, { cwd: dir })
    assert.equal(results.length, 1)
    assert.equal(results[0].file, 'missing.txt')
    assert.equal(results[0].error, 'not found')
})

test('applyUnifiedDiff: multiple files in one diff produce one result per file', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'a.txt'), 'foo\n')
    fs.writeFileSync(path.join(dir, 'b.txt'), 'bar\n')
    const diff = [
        '--- a.txt', '+++ a.txt', '@@ -1,1 +1,1 @@', '-foo', '+foo2',
        '--- b.txt', '+++ b.txt', '@@ -1,1 +1,1 @@', '-bar', '+bar2',
    ].join('\n')
    const results = applyUnifiedDiff(diff, { cwd: dir })
    assert.equal(results.length, 2)
    assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8').trim(), 'foo2')
    assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8').trim(), 'bar2')
})

test('applyUnifiedDiff: malformed input with no valid file headers returns an empty result set', () => {
    const dir = tmpDir()
    const results = applyUnifiedDiff('this is not a diff at all\njust some text', { cwd: dir })
    assert.deepEqual(results, [])
})
