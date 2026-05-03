import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { listSessions, search, getMessages } from '../sessions.js'
import { registry, discoverBuiltinTools } from '../tools/registry.js'
import { listDebug, snapshot, snapshotAll, attachDebugRoutes } from '../observability/debug.js'
import { loadConfig, saveConfigValue } from '../config.js'
import { listJobs, createJob, deleteJob } from '../cron/scheduler.js'
import { listSkills } from '../skills/index.js'
import { listAllProfiles } from '../commands/profile.js'
import { COMMAND_REGISTRY } from '../commands/registry.js'
import { getFreddieHome } from '../home.js'
import { runTurn } from '../agent/machine.js'
import { runBatch } from '../batch.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ENV_KEYS = [
    'ANTHROPIC_API_KEY','OPENAI_API_KEY','GROQ_API_KEY','OPENROUTER_API_KEY',
    'TELEGRAM_BOT_TOKEN','DISCORD_BOT_TOKEN','SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET',
    'WHATSAPP_API_TOKEN','SIGNAL_CLI_URL','MATRIX_HOMESERVER','MATTERMOST_URL',
    'HONCHO_API_KEY','MEM0_API_KEY','SUPERMEMORY_API_KEY','BYTEROVER_API_KEY',
    'HINDSIGHT_API_KEY','OPENVIKING_API_KEY','RETAINDB_API_KEY','SERPAPI_KEY',
    'REPLICATE_API_TOKEN','SMTP_HOST','TWILIO_SID','HASS_TOKEN',
]

function readLogs(subsystem, max = 200) {
    const file = path.join(getFreddieHome(), 'logs', `${subsystem}.log`)
    if (!fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-max)
    return lines.map(l => { try { return JSON.parse(l) } catch { return { raw: l } } })
}

export async function createDashboard({ port = 0 } = {}) {
    await discoverBuiltinTools()
    const app = express()
    app.use(express.json())
    app.use(express.static(__dirname))
    app.use('/vendor/anentrypoint-design', express.static(path.join(__dirname, '..', '..', 'node_modules', 'anentrypoint-design', 'dist')))
    app.get('/api/sessions', async (_, res) => res.json(await listSessions()))
    app.get('/api/sessions/:id/messages', async (req, res) => res.json(await getMessages(req.params.id)))
    app.get('/api/search', async (req, res) => res.json(await search(String(req.query.q || ''))))
    app.get('/api/tools', (_, res) => res.json(registry.list().map(t => ({ name: t.name, toolset: t.toolset, schema: t.schema }))))
    app.get('/api/debug', (_, res) => res.json(listDebug()))
    app.get('/api/debug-all', (_, res) => res.json(snapshotAll()))
    app.get('/api/config', (_, res) => res.json(loadConfig()))
    app.get('/api/cron', async (_, res) => res.json(await listJobs()))
    app.get('/api/skills', (_, res) => {
        const home = listSkills()
        const bundled = listSkills([path.resolve('skills')])
        res.json({ home, bundled })
    })
    app.get('/api/profiles', (_, res) => res.json(listAllProfiles()))
    app.get('/api/commands', (_, res) => res.json(COMMAND_REGISTRY))
    app.get('/api/env', (_, res) => res.json(ENV_KEYS.map(k => ({ key: k, set: !!process.env[k] }))))
    app.get('/api/logs/:subsystem', (req, res) => res.json(readLogs(req.params.subsystem, Number(req.query.max) || 200)))
    app.get('/api/logs', (_, res) => {
        const dir = path.join(getFreddieHome(), 'logs')
        if (!fs.existsSync(dir)) return res.json([])
        res.json(fs.readdirSync(dir).filter(f => f.endsWith('.log')).map(f => f.replace(/\.log$/, '')))
    })
    app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now(), freddie_home: getFreddieHome() }))
    app.get('/api/tools/detail', (_, res) => res.json(registry.list().map(t => ({ name: t.name, toolset: t.toolset, description: t.schema?.description || '' }))))
    app.get('/api/gateway', (_, res) => {
        const platforms = ['webhook', 'api_server', 'telegram', 'discord', 'slack', 'whatsapp', 'signal', 'matrix',
            'mattermost', 'email', 'sms', 'mqtt', 'feishu', 'line', 'viber', 'teams', 'wechat', 'rss']
        res.json({ platforms: platforms.map(p => ({ name: p, enabled: false, note: 'start with freddie gateway --port <port>' })) })
    })
    app.post('/api/batch', async (req, res) => {
        const { prompts = [], concurrency = 4, model = '' } = req.body || {}
        if (!prompts.length) return res.status(400).json({ error: 'prompts required' })
        try { res.json(await runBatch({ prompts, concurrency, model })) } catch (e) { res.status(500).json({ error: String(e.message || e) }) }
    })

    app.post('/api/cron', async (req, res) => {
        const { cron, prompt, model = null } = req.body || {}
        if (!cron || !prompt) return res.status(400).json({ error: 'cron and prompt required' })
        try { res.json({ id: await createJob({ cron, prompt, model }) }) } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
    })
    app.delete('/api/cron/:id', async (req, res) => { await deleteJob(Number(req.params.id)); res.json({ ok: true }) })

    app.post('/api/config', (req, res) => {
        const { key, value } = req.body || {}
        if (!key) return res.status(400).json({ error: 'key required' })
        try { res.json(saveConfigValue(key, value)) } catch (e) { res.status(400).json({ error: String(e.message || e) }) }
    })

    app.post('/api/chat', async (req, res) => {
        const { prompt, sessionId = null } = req.body || {}
        if (!prompt) return res.status(400).json({ error: 'prompt required' })
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        send('start', { ts: Date.now(), sessionId })
        try {
            const out = await runTurn({ prompt, timeoutMs: 30000 })
            for (const m of out.messages) send('message', m)
            send('done', { result: out.result || '', iterations: out.iterations })
        } catch (e) { send('error', { error: String(e.message || e) }) }
        res.end()
    })

    attachDebugRoutes(app)
    const server = await new Promise(r => { const s = app.listen(port, () => r(s)) })
    const actualPort = server.address().port
    return { server, port: actualPort, url: `http://127.0.0.1:${actualPort}/`, stop: () => new Promise(r => server.close(() => r())) }
}
