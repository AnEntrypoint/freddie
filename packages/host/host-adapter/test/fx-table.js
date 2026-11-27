import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import services, { UNREPORTED_TOOLS, VERB_BACKS } from '../src/services.js'

const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/' + name, import.meta.url)), 'utf8'))
const verbNames = fixture('fx-host-verbs.json')
const toolNames = fixture('fx-tool-names.json')

const toolMembers = Object.values(services).filter((row) => row.source === 'tools').flatMap((row) => row.members)
assert.equal(new Set(toolMembers).size, toolMembers.length, 'no tool name sits in two rows')
assert.deepEqual([...toolMembers].sort(), [...toolNames].sort(), 'the tool rows name exactly the tool names fx publishes')
assert.deepEqual(Object.keys(UNREPORTED_TOOLS), ['AgentSwarm'], 'the one published tool the host leaves out is named')

assert.deepEqual(Object.keys(VERB_BACKS).sort(), [...verbNames].sort(), 'every live host verb has a backing entry')
const provided = new Set(Object.values(services).map((row) => row.capability).filter(Boolean))
for (const [verb, capability] of Object.entries(VERB_BACKS)) assert.ok(provided.has(capability), verb + ' backs ' + capability + ', which a row provides')
console.log('fx-table: ' + toolMembers.length + ' tool names, ' + verbNames.length + ' host verbs, ' + Object.keys(UNREPORTED_TOOLS).length + ' published tool the host leaves out')
