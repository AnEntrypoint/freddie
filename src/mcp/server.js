import readline from 'node:readline'
import { bootHost } from '../host/index.js'
import { listSkills } from '../skills/index.js'
import { logger } from '../observability/log.js'

const log = logger('mcp')

const PROTOCOL_VERSION = '2024-11-05'

export class McpServer {
    constructor({ stdin = process.stdin, stdout = process.stdout } = {}) { this.in = stdin; this.out = stdout }
    start() {
        const rl = readline.createInterface({ input: this.in, crlfDelay: Infinity })
        rl.on('line', (l) => this.handle(l).catch(e => this._err(null, String(e))))
        this.rl = rl
    }
    stop() { this.rl?.close() }
    _send(o) { this.out.write(JSON.stringify(o) + '\n') }
    _ok(id, result) { this._send({ jsonrpc: '2.0', id, result }) }
    _err(id, message) { this._send({ jsonrpc: '2.0', id, error: { code: -32603, message } }) }
    async handle(line) {
        if (!line.trim()) return
        let req; try { req = JSON.parse(line) } catch { return this._err(null, 'invalid json') }
        log.info('rpc', { method: req.method, id: req.id })
        const fn = METHODS[req.method]
        if (!fn) return this._err(req.id, 'unknown method: ' + req.method)
        try { this._ok(req.id, await fn(req.params || {})) } catch (e) { this._err(req.id, String(e?.message || e)) }
    }
}
const METHODS = {
    initialize: () => ({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: 'freddie-mcp', version: '0.4.0' },
    }),
    'tools/list': async () => {
        const h = await bootHost()
        return { tools: h.pi.tools.list().map(t => ({ name: t.name, description: t.schema?.description, inputSchema: t.schema?.parameters || {} })) }
    },
    'tools/call': async ({ name, arguments: args = {} }) => {
        const h = await bootHost()
        const out = await h.pi.dispatchTool(name, args)
        return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }] }
    },
    'prompts/list': async () => {
        const skills = listSkills()
        return { prompts: skills.map(s => ({ name: s.name, description: s.description })) }
    },
    'resources/list': async () => ({ resources: [] }),
}
