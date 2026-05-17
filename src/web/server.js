import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootHost } from '../host/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function createDashboard({ port = 0 } = {}) {
    const host = await bootHost()
    const app = express()
    app.use(express.json())
    app.use(express.static(__dirname))
    const fromNodeModules = path.join(__dirname, '..', '..', 'node_modules', 'anentrypoint-design', 'dist')
    app.use('/vendor/anentrypoint-design', express.static(fromNodeModules))
    const nmKitsOs = path.join(__dirname, '..', '..', 'node_modules', 'anentrypoint-design', 'src', 'kits', 'os')
    app.use('/vendor/anentrypoint-design/kits/os', express.static(nmKitsOs))
    for (const r of host.gui.routes.list()) {
        const verb = r.method.toLowerCase()
        if (typeof app[verb] === 'function') app[verb](r.path, r.handler)
    }
    const debugApi = host.gui._state.apis.get('debug')
    if (debugApi?.attach) debugApi.attach(app)
    const { server, actualPort } = await new Promise((res, rej) => { const s = app.listen(port, () => res({ server: s, actualPort: s.address().port })); s.once('error', rej) })
    return { server, port: actualPort, url: `http://127.0.0.1:${actualPort}/`, stop: () => new Promise(r => server.close(() => r())) }
}
