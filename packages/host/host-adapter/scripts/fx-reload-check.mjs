import host from 'fx:host'
import { mkdirSync, writeFileSync } from 'fs'
import { planHost, hostView, services } from '../src/index.js'

const dir = '/workspace/tmp/freddie/reload-check'
const target = dir + '/counter.mjs'
const loader = hostView(host, 'loader', services.loader)
const results = []
const check = (name, ok) => { results.push((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) throw new Error('fx reload check failed: ' + name) }

mkdirSync(dir, { recursive: true })
const plan = planHost(host)
check('loader row registers', plan.register.includes('loader'))

writeFileSync(target, 'export const value = "v1"\n')
const first = await loader.reload(target)
check('module loads (v1)', first.value === 'v1')

writeFileSync(target, 'export const value = "v2"\n')
const second = await loader.reload(target)
check('edited on disk reloads (v2)', second.value === 'v2')

writeFileSync(target, 'export const value = \n')
const broken = await loader.reload(target)
check('broken edit keeps the last good module (v2)', broken.value === 'v2')

writeFileSync(target, 'export const value = "v3"\n')
const third = await loader.reload(target)
check('fixed edit reloads again (v3)', third.value === 'v3')

for (const line of results) console.log(line)
console.log('fx reload check: ' + results.length + ' of ' + results.length + ' ok')
