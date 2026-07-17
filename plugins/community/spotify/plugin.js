import { env } from '../../../src/env.js'

const spotifyTool = {
    name: 'spotify',
    toolset: 'core',
    schema: { name: 'spotify', description: 'Spotify playback control (Web API).', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'pause', 'next', 'previous', 'search', 'queue'] }, query: { type: 'string' }, uri: { type: 'string' } }, required: ['action'] } },
    requiresEnv: ['SPOTIFY_ACCESS_TOKEN'],
    checkFn: () => Boolean(env('SPOTIFY_ACCESS_TOKEN')),
    handler: async ({ action, query, uri }) => {
        if (!env('SPOTIFY_ACCESS_TOKEN')) return { error: 'SPOTIFY_ACCESS_TOKEN required' }
        const auth = { authorization: `Bearer ${env('SPOTIFY_ACCESS_TOKEN')}` }
        const base = 'https://api.spotify.com/v1'
        const map = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] }
        if (map[action]) { const r = await fetch(base + map[action][1], { method: map[action][0], headers: auth, body: uri ? JSON.stringify({ uris: [uri] }) : null }); return { status: r.status } }
        if (action === 'search') return await (await fetch(`${base}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, { headers: auth })).json()
        if (action === 'queue') return await (await fetch(`${base}/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST', headers: auth })).json()
        return { error: 'unknown action' }
    },
}

export default {
    name: 'spotify',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(spotifyTool)
    },
}
