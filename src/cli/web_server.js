import { createDashboard } from '../web/server.js'
import { getConfigValue } from '../config.js'

let _dashboard = null

export async function start({ port = null } = {}) {
    if (_dashboard) return _dashboard
    const p = port || getConfigValue('web.port', 0)
    _dashboard = await createDashboard({ port: Number(p) })
    return _dashboard
}
export async function stop() { if (_dashboard) { await _dashboard.stop(); _dashboard = null } }
export function status() { return _dashboard ? { running: true, url: _dashboard.url, port: _dashboard.port } : { running: false } }
