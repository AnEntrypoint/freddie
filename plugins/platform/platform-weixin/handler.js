import { makeWebhookPlatformAdapter } from '../../../src/gateway/webhook_platform.js'

export const WeixinAdapter = makeWebhookPlatformAdapter({
    platform: 'weixin',
    envVar: 'WEIXIN_TOKEN',
    defaultApi: 'https://api.weixin.qq.com/cgi-bin/message/send',
    className: 'WeixinAdapter',
})
