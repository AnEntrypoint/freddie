import { listSkills } from '../../src/skills/index.js'
export const _tool = ({
    name: 'skills_index',
    toolset: 'core',
    schema: { name: 'skills_index', description: 'Build a search index of available skills (name + description + first-line of body) for the agent to query.', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
    handler: async ({ query }) => {
        const all = listSkills().map(s => ({ name: s.name, description: s.description, hint: (s.body || '').split('\n').find(l => l.trim()) || '' }))
        if (!query) return { items: all }
        const q = String(query).toLowerCase()
        return { items: all.filter(s => (s.name + ' ' + s.description + ' ' + s.hint).toLowerCase().includes(q)) }
    },
})
