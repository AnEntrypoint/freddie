import { award, listAchievements } from './lib/store.js'

export default {
    name: 'achievements',
    surfaces: 'pi',
    register({ hooks }) {
        hooks.on('onSessionStart', async (p) => { await award('session-start', { id: p.session?.id }); return p })
    },
}

export { award, listAchievements }
