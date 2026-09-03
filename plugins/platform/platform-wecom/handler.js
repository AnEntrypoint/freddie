import { makeWebhookPlatformAdapter } from '../../../src/gateway/webhook_platform.js'

export const WecomAdapter = makeWebhookPlatformAdapter({
    platform: 'wecom',
    envVar: 'WECOM_WEBHOOK_KEY',
    defaultApi: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send',
    className: 'WecomAdapter',
})
