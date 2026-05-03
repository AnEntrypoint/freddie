import { Gateway } from '../gateway/run.js'
import { WebhookAdapter } from '../gateway/platforms/webhook.js'
import { ApiServerAdapter } from '../gateway/platforms/api_server.js'
import { registerBuiltinHooks } from '../gateway/builtin_hooks/index.js'
let _gateway = null
export async function startGateway({ port = 0, hooks = true } = {}) {
    if (_gateway) return _gateway
    const wh = new WebhookAdapter({ port })
    const api = new ApiServerAdapter({ port: 0 })
    const gw = new Gateway({ platforms: { webhook: wh, api_server: api } })
    if (hooks) registerBuiltinHooks(gw)
    await gw.start()
    _gateway = { gw, webhook: wh, api }
    return { webhookPort: wh.port, apiPort: api.port }
}
export async function stopGateway() { if (_gateway) { await _gateway.gw.stop(); _gateway = null } return { stopped: true } }
export function gatewayStatus() { return _gateway ? { running: true, webhookPort: _gateway.webhook.port, apiPort: _gateway.api.port } : { running: false } }
