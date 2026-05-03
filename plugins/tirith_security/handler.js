import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../src/home.js'
function policyPath() { return path.join(getFreddieHome(), 'policy.json') }
function loadPolicy() { try { return JSON.parse(fs.readFileSync(policyPath(), 'utf8')) } catch { return { tools: {}, hosts: { allow: [], deny: [] } } } }

export const _tool = ({
    name: 'tirith_security',
    toolset: 'core',
    schema: { name: 'tirith_security', description: 'Evaluate a candidate action against ~/.freddie/policy.json. Returns allow|deny|ask.', parameters: { type: 'object', properties: { kind: { type: 'string' }, target: { type: 'string' } }, required: ['kind', 'target'] } },
    handler: async ({ kind, target }) => {
        const p = loadPolicy()
        if (kind === 'tool') {
            const t = p.tools?.[target]
            if (t === 'allow' || t === 'deny') return { decision: t }
        }
        if (kind === 'host') {
            if (p.hosts?.deny?.some(d => target.includes(d))) return { decision: 'deny' }
            if (p.hosts?.allow?.some(d => target.includes(d))) return { decision: 'allow' }
        }
        return { decision: 'ask' }
    },
})
