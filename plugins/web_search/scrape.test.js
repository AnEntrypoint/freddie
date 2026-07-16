import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDdgHtml } from './scrape.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ddg-results.html'), 'utf8')

test('parseDdgHtml extracts title/url/snippet for each result', () => {
    const results = parseDdgHtml(FIXTURE, 5)
    assert.equal(results.length, 3)

    assert.equal(results[0].url, 'https://example.com/anthropic-claude')
    assert.equal(results[0].title, 'Anthropic & Claude - Official Site')
    assert.equal(results[0].snippet, 'Learn about Claude, the AI assistant built by Anthropic. Fast, safe & helpful.')

    assert.equal(results[2].url, 'https://example.net/third')
    assert.equal(results[2].title, 'Third Result Title')
    assert.equal(results[2].snippet, 'A plain third snippet with no entities.')
})

test('parseDdgHtml unescapes standard HTML entities (&amp; &lt; &gt; &quot; &#39;) in titles and snippets', () => {
    const results = parseDdgHtml(FIXTURE, 5)
    const tagsResult = results[1]

    assert.equal(tagsResult.title, 'Tags: <script> & "quotes" test')
    assert.equal(tagsResult.snippet, "It's a snippet with <b>fake tags</b> and a real bolded word.")
    assert.equal(tagsResult.url, 'https://example.org/tags?x=1&y=2')
})

test('parseDdgHtml strips real <b> highlight tags but keeps escaped literal tags as text', () => {
    const results = parseDdgHtml(FIXTURE, 5)
    // The literal, escaped "<b>fake tags</b>" text must survive as text (not be stripped),
    // while the actual highlight markup around "bolded" must be removed.
    assert.match(results[1].snippet, /<b>fake tags<\/b>/)
    assert.doesNotMatch(results[1].snippet, /<b>bolded<\/b>/)
})

test('parseDdgHtml respects the limit parameter', () => {
    const results = parseDdgHtml(FIXTURE, 2)
    assert.equal(results.length, 2)
})

test('parseDdgHtml returns an empty array for empty/garbage input', () => {
    assert.deepEqual(parseDdgHtml('', 5), [])
    assert.deepEqual(parseDdgHtml('<html><body>no results here</body></html>', 5), [])
    assert.deepEqual(parseDdgHtml(null, 5), [])
})
