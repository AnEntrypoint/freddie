import { makeWebhookPlatformAdapter } from '../../../src/gateway/webhook_platform.js'

export const HomeassistantAdapter = makeWebhookPlatformAdapter({
    platform: 'homeassistant',
    envVar: 'HASS_TOKEN',
    defaultApi: 'http://homeassistant.local:8123/api/services/notify/notify',
    className: 'HomeassistantAdapter',
})
