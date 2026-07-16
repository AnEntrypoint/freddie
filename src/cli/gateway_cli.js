import { Gateway } from '../gateway/run.js'
import { makePlatform } from '../gateway/platforms.js'
import { registerBuiltinHooks } from '../gateway/builtin_hooks/index.js'
import { logger } from '../observability/log.js'
const log = logger('gateway_cli')
let _gateway = null
export async function startGateway({ port = 0, hooks = true } = {}) {
    if (_gateway) return _gateway
    // Rehydrate interrupted agent turns / batches before the gateway starts taking traffic.
    try { const { resumeAll } = await import('../machines/resume.js'); await resumeAll() } catch (e) { log.warn('resumeAll failed during gateway boot', { err: String(e) }) }
    const wh = await makePlatform('webhook', { port })
    const api = await makePlatform('api_server', { port: 0 })
    const gw = new Gateway({ platforms: { webhook: wh, api_server: api } })
    if (hooks) registerBuiltinHooks(gw)
    await gw.start()
    _gateway = { gw, webhook: wh, api }
    return { webhookPort: wh.port, apiPort: api.port }
}
export async function stopGateway() { if (_gateway) { await _gateway.gw.stop(); _gateway = null } return { stopped: true } }
export function gatewayStatus() { return _gateway ? { running: true, webhookPort: _gateway.webhook.port, apiPort: _gateway.api.port } : { running: false } }
