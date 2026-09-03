import { env } from '../../../src/env.js'

const googleMeetTool = {
    name: 'google_meet',
    toolset: 'core',
    schema: { name: 'google_meet', description: 'Schedule / list Google Meet calls.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'schedule'] }, summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['action'] } },
    requiresEnv: ['GOOGLE_OAUTH_TOKEN'],
    checkFn: () => Boolean(env('GOOGLE_OAUTH_TOKEN')),
    handler: async ({ action, summary, start, end }) => {
        if (!env('GOOGLE_OAUTH_TOKEN')) return { error: 'GOOGLE_OAUTH_TOKEN required' }
        const auth = { authorization: `Bearer ${env('GOOGLE_OAUTH_TOKEN')}` }
        if (action === 'list') return await (await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', { headers: auth })).json()
        if (action === 'schedule') return await (await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ summary, start: { dateTime: start }, end: { dateTime: end }, conferenceData: { createRequest: { requestId: String(Date.now()) } } }) })).json()
        return { error: 'unknown action' }
    },
}

export default {
    name: 'google-meet',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(googleMeetTool)
    },
}
