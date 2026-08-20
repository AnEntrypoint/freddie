import { makeWebhookPlatformAdapter } from '../../../src/gateway/webhook_platform.js'

export const FeishuAdapter = makeWebhookPlatformAdapter({
    platform: 'feishu',
    envVar: 'FEISHU_APP_TOKEN',
    defaultApi: 'https://open.feishu.cn/open-apis/im/v1/messages',
    className: 'FeishuAdapter',
})
