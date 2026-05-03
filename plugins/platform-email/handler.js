import { EventEmitter } from 'node:events'
import net from 'node:net'

export class EmailAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'email'
        this.smtpHost = opts.smtpHost || process.env.SMTP_HOST
        this.smtpPort = opts.smtpPort || Number(process.env.SMTP_PORT || 587)
        this.smtpUser = opts.smtpUser || process.env.SMTP_USER
        this.smtpPass = opts.smtpPass || process.env.SMTP_PASS
        this.imapHost = opts.imapHost || process.env.IMAP_HOST
        this._running = false
    }
    getRequiredEnv() { return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] }
    async start() {
        if (!this.smtpHost || !this.smtpUser || !this.smtpPass) throw new Error('EmailAdapter: SMTP_HOST/USER/PASS required')
        this._running = true
    }
    async stop() { this._running = false }
    async send(reply) {
        return new Promise((resolve, reject) => {
            const sock = net.createConnection(this.smtpPort, this.smtpHost)
            const lines = []
            const send = s => sock.write(s + '\r\n')
            sock.on('data', d => {
                const text = d.toString()
                lines.push(text)
                const code = parseInt(text.slice(0, 3), 10)
                if (code >= 400) { sock.end(); return reject(new Error('SMTP error: ' + text)) }
            })
            sock.on('error', reject)
            sock.on('connect', () => {
                send('EHLO freddie')
                send('AUTH LOGIN')
                send(Buffer.from(this.smtpUser).toString('base64'))
                send(Buffer.from(this.smtpPass).toString('base64'))
                send('MAIL FROM:<' + this.smtpUser + '>')
                send('RCPT TO:<' + reply.to + '>')
                send('DATA')
                send('Subject: ' + (reply.subject || 'freddie'))
                send('To: ' + reply.to)
                send('')
                send(reply.text)
                send('.')
                send('QUIT')
                setTimeout(() => { sock.end(); resolve({ ok: true, log: lines.join('') }) }, 500)
            })
        })
    }
}
