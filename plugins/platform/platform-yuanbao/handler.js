import { BasePlatformAdapter } from '../../../src/gateway/base.js'
import { env } from '../../../src/env.js'
export class YuanbaoAdapter extends BasePlatformAdapter {
    constructor(opts = {}) { super({ ...opts, platform: 'yuanbao' }); this.token = opts.token || env('YUANBAO_API_KEY'); this.api = opts.api || 'https://api.hunyuan.cloud.tencent.com/v1' }
    getRequiredEnv() { return ['YUANBAO_API_KEY'] }
    async send(reply) {
        const r = await fetch(this.api + '/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + this.token, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'hunyuan-pro', messages: [{ role: 'user', content: reply.text }] }) })
        return await r.json()
    }
}
