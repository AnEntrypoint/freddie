import { env } from '../../../src/env.js'

export const _tool = ({
    name: 'homeassistant_tool',
    toolset: 'core',
    schema: { name: 'homeassistant_tool', description: 'Read state or call a service on Home Assistant.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['state', 'service'] }, entity_id: { type: 'string' }, domain: { type: 'string' }, service: { type: 'string' }, data: {} }, required: ['action'] } },
    requiresEnv: ['HASS_TOKEN', 'HASS_URL'],
    checkFn: () => Boolean(env('HASS_TOKEN')),
    handler: async ({ action, entity_id, domain, service, data = {} }) => {
        const url = env('HASS_URL') || 'http://homeassistant.local:8123'
        const auth = { authorization: `Bearer ${env('HASS_TOKEN')}` }
        if (action === 'state') return await (await fetch(`${url}/api/states/${entity_id}`, { headers: auth })).json()
        if (action === 'service') return await (await fetch(`${url}/api/services/${domain}/${service}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ entity_id, ...data }) })).json()
        return { error: 'unknown action' }
    },
})
