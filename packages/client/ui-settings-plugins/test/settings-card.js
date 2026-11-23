import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { settingsCardCss } from '../src/client/settings-card.css.js'

const css = readFileSync(fileURLToPath(new URL('../src/client/settings-card.css', import.meta.url)), 'utf8')
const entries = Object.entries(settingsCardCss)

assert.ok(entries.length > 0, 'the class map has entries')
for (const [key, name] of entries) {
  assert.equal(name, 'freddie-settingsCard__' + key, key + ' is named by its key')
  assert.ok(new RegExp('\\.' + name + '(?![\\w-])').test(css), name + ' is styled by settings-card.css')
}
assert.equal(/subagentCard|webSearchCard/.test(css), false, 'no card-specific prefix remains')
console.log('settings-card: ' + entries.length + ' classes, each styled, one stylesheet')
