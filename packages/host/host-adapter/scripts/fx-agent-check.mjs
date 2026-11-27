import host from 'fx:host'
import { planHost, hostView, services } from '../src/index.js'

const prompt = 'AGENT_TURN_PROMPT_7'
const results = []
const check = (name, ok) => { results.push((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) throw new Error('fx agent check failed: ' + name) }

const plan = planHost(host)
check('agent.core and agent.persistence register', plan.register.includes('agent.core') && plan.register.includes('agent.persistence'))

const core = hostView(host, 'agent.core', services['agent.core']).core
const reply = core.turn(prompt)
check('a turn through the adapter returns the prompt it was given', String(reply).trim() === prompt)

const persistence = hostView(host, 'agent.persistence', services['agent.persistence']).persistence
persistence.write('freddie-check', { prompt })
check('persistence writes and reads back in the same process', JSON.stringify(persistence.read('freddie-check')) === JSON.stringify({ prompt }))

for (const line of results) console.log(line)
console.log('fx agent check: ' + results.length + ' of ' + results.length + ' ok')
