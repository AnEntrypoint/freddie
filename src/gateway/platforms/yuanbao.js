import { BasePlatformAdapter } from '../base.js'
export class YuanbaoAdapter extends BasePlatformAdapter {
    constructor(opts = {}) { super({ ...opts, platform: 'yuanbao' }); this.token = opts.token || process.env.YUANBAO_API_KEY; this.api = opts.api || 'https://api.hunyuan.cloud.tencent.com/v1' }
    getRequiredEnv() { return ['YUANBAO_API_KEY'] }
    async send(reply) {
        const r = await fetch(this.api + '/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + this.token, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'hunyuan-pro', messages: [{ role: 'user', content: reply.text }] }) })
        return await r.json()
    }
}
