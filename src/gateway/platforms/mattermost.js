import express from 'express'
import { EventEmitter } from 'node:events'

export class MattermostAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'mattermost'
        this.url = opts.url || process.env.MATTERMOST_URL
        this.token = opts.token || process.env.MATTERMOST_TOKEN
        this.port = opts.port || 0
        this._server = null
    }
    getRequiredEnv() { return ['MATTERMOST_URL', 'MATTERMOST_TOKEN'] }
    async start() {
        if (!this.url || !this.token) throw new Error('MattermostAdapter: MATTERMOST_URL + MATTERMOST_TOKEN required')
        const app = express()
        app.use(express.urlencoded({ extended: true }))
        app.post('/hook', (req, res) => {
            this.emit('message', { from: req.body.channel_id, text: req.body.text || '', user: req.body.user_id, raw: req.body })
            res.json({})
        })
        await new Promise(r => { this._server = app.listen(this.port, () => r()) })
        this.port = this._server.address().port
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send(reply) {
        return fetch(`${this.url}/api/v4/posts`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ channel_id: reply.to, message: reply.text }) }).then(r => r.json())
    }
}
