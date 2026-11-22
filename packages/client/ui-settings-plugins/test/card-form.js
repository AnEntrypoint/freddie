import '@freddie/freddie-runtime/install-node'
import { register } from 'node:module'

register('data:text/javascript,' + encodeURIComponent("export async function resolve(specifier, context, next) { return specifier === '@freddie/freddie-client-ui-settings-plugins/client' ? next(new URL('../src/client/card-form.js', '" + import.meta.url + "').href, context) : next(specifier, context) }"))
const { SubagentCardController } = await import('../../ui-settings-subagent/src/client/subagent-card-controller.js')
const { WebSearchCardController } = await import('../../ui-settings-web-search/src/client/web-search-card-controller.js')
const scopeOf = () => { const user = {}; const listeners = new Set(); return { user, writes: [], getSnapshot: () => ({ status: 'ready', writable: true, value: { ...user }, base: {}, user }), subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) }, async set(f, v) { this.writes.push(['set', f, v]); user[f] = v; listeners.forEach((l) => l()) }, async unset(f) { this.writes.push(['unset', f]); delete user[f]; listeners.forEach((l) => l()) } } }
const check = (c, m) => { if (!c) throw new Error('card-form check failed: ' + m) }
const sub = scopeOf(); const s = new SubagentCardController(sub); const a = s.inject()
a.edit('maxDepth', '-1'); check(s.form.field('maxDepth').invalid && s.form.shell().invalid, 'a negative depth is invalid')
a.edit('maxDepth', ' 3 '); a.edit('maxActiveSubagents', '2'); await s.form.save()
check(JSON.stringify(sub.writes) === JSON.stringify([['set', 'maxDepth', 3], ['set', 'maxActiveSubagents', 2]]), 'subagent writes ' + JSON.stringify(sub.writes))
a.resetField('maxDepth'); await s.form.save(); check(sub.writes.at(-1)[0] === 'unset' && !('maxDepth' in sub.user), 'reset clears the override')
const web = scopeOf(); const keys = []; const w = new WebSearchCardController(web, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } })
w.writeKey = async (text) => { keys.push(text); return true }
const b = w.form.actions()
b.edit('baseURL', 'ftp://example.com'); check(w.form.field('baseURL').invalid, 'a non-http endpoint is invalid')
b.edit('baseURL', 'https://example.com/search'); b.edit('maxUses', '0'); check(w.form.field('maxUses').invalid, 'maxUses below one is invalid')
b.edit('maxUses', '4'); b.edit('apiKey', ' sk-1 '); await w.form.save()
check(JSON.stringify(web.writes) === JSON.stringify([['set', 'baseURL', 'https://example.com/search'], ['set', 'maxUses', 4]]) && keys.join() === 'sk-1', 'web-search writes ' + JSON.stringify(web.writes) + ' keys ' + keys)
console.log('card-form: subagent and web-search cards stage, validate, save and reset through the shared CardForm')
