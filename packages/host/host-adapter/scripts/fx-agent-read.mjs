import host from 'fx:host'
import { hostView, services } from '../src/index.js'

const prompt = 'AGENT_TURN_PROMPT_7'
const persistence = hostView(host, 'agent.persistence', services['agent.persistence']).persistence
const value = persistence.read('freddie-check')
if (JSON.stringify(value) !== JSON.stringify({ prompt })) throw new Error('fx agent read failed: ' + JSON.stringify(value))
console.log('ok   persistence read in a second process returns what the first wrote')
