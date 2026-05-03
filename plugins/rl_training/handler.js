export const _tool = ({
    name: 'rl_training',
    toolset: 'core',
    schema: { name: 'rl_training', description: 'Kick off an RL rollout (Atropos integration).', parameters: { type: 'object', properties: { task: { type: 'string' }, model: { type: 'string' } }, required: ['task'] } },
    requiresEnv: ['ATROPOS_URL'],
    checkFn: () => Boolean(process.env.ATROPOS_URL),
    handler: async ({ task, model }) => {
        if (!process.env.ATROPOS_URL) return { error: 'ATROPOS_URL required' }
        const r = await fetch(process.env.ATROPOS_URL + '/rollouts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ATROPOS_TOKEN || ''}` }, body: JSON.stringify({ task, model }) })
        return await r.json()
    },
})
