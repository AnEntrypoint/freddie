import { env } from '../../src/env.js'

export const _tool = ({
    name: 'discord_tool',
    toolset: 'core',
    schema: { name: 'discord_tool', description: 'Send a message to a Discord channel via REST.', parameters: { type: 'object', properties: { channel_id: { type: 'string' }, content: { type: 'string' } }, required: ['channel_id', 'content'] } },
    requiresEnv: ['DISCORD_BOT_TOKEN'],
    checkFn: () => Boolean(env('DISCORD_BOT_TOKEN')),
    handler: async ({ channel_id, content }) => {
        if (!env('DISCORD_BOT_TOKEN')) return { error: 'DISCORD_BOT_TOKEN required' }
        const r = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, { method: 'POST', headers: { authorization: `Bot ${env('DISCORD_BOT_TOKEN')}`, 'content-type': 'application/json' }, body: JSON.stringify({ content }) })
        return await r.json()
    },
})
