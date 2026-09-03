import { makeWebhookPlatformAdapter } from '../../../src/gateway/webhook_platform.js'

export const DingtalkAdapter = makeWebhookPlatformAdapter({
    platform: 'dingtalk',
    envVar: 'DINGTALK_ACCESS_TOKEN',
    defaultApi: 'https://oapi.dingtalk.com/robot/send',
    className: 'DingtalkAdapter',
})
