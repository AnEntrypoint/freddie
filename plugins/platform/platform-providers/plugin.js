// Consolidated webhook-style platform plugin. Replaces 6 formerly-separate
// platform-<name> directories with one registration point:
//   - webhook, mattermost, qqbot, bluebubbles are genuine base+config: an
//     express server receiving one webhook POST and (for 3 of them) a plain
//     bearer-auth REST call to send replies, differing only in route path,
//     body parser, field names, and endpoint -- driven through
//     ../../_shared/webhook-platform-base.js's createWebhookPlatform() factory
//     via the descriptor table below.
//   - sms (Twilio) and email (raw SMTP) have genuinely divergent protocols
//     (form-urlencoded + TwiML XML + Basic auth; raw SMTP socket, no webhook
//     receive at all) and keep their own adapter modules under ./lib/ per
//     the "small adapter module" allowance for platforms whose transport
//     diverges from the REST-webhook shape.
import { env } from '../../../src/env.js'
import { createWebhookPlatform } from '../../_shared/webhook-platform-base.js'
import { SmsAdapter } from './lib/sms-adapter.js'
import { EmailAdapter } from './lib/email-adapter.js'

const DESCRIPTORS = [
    {
        // Generic catch-all: no auth, no outbound REST call -- replies are
        // just buffered on this.outbox for the caller to inspect/relay.
        name: 'webhook', className: 'WebhookAdapter',
        routePath: (self) => self.path,
        buildOpts: (self, opts) => { self.path = opts.path || '/webhook' },
        parseMessage: (req) => ({ from: req.body?.from || 'webhook', text: req.body?.text || '', raw: req.body }),
        useOutbox: true,
    },
    {
        name: 'mattermost', className: 'MattermostAdapter',
        envKeys: ['MATTERMOST_URL', 'MATTERMOST_TOKEN'],
        parser: 'urlencoded',
        routePath: () => '/hook',
        buildOpts: (self, opts) => { self.url = opts.url || env('MATTERMOST_URL'); self.token = opts.token || env('MATTERMOST_TOKEN') },
        requireBeforeStart: (self) => !!(self.url && self.token),
        parseMessage: (req) => ({ from: req.body.channel_id, text: req.body.text || '', user: req.body.user_id, raw: req.body }),
        buildAck: () => ({}),
        sendUrl: (self) => `${self.url}/api/v4/posts`,
        sendHeaders: (self) => ({ authorization: `Bearer ${self.token}`, 'content-type': 'application/json' }),
        sendBody: (self, reply) => ({ channel_id: reply.to, message: reply.text }),
    },
    {
        name: 'qqbot', className: 'QqbotAdapter',
        envKeys: ['QQBOT_TOKEN'],
        routePath: () => '/webhook',
        buildOpts: (self, opts) => { self.token = opts.token || env('QQBOT_TOKEN'); self.api = opts.api || 'https://api.sgroup.qq.com/channels/messages' },
        requireBeforeStart: (self) => !!self.token,
        parseMessage: (req) => {
            const text = req.body?.text || req.body?.message?.text || req.body?.content || ''
            const from = req.body?.from || req.body?.user_id || req.body?.sender_id || ''
            return { from: String(from), text, raw: req.body }
        },
        sendGuard: (self) => { if (!self.token) throw new Error('QqbotAdapter: token required') },
        sendUrl: (self) => self.api,
        sendHeaders: (self) => ({ authorization: `Bearer ${self.token}`, 'content-type': 'application/json' }),
        sendBody: (self, reply) => ({ to: reply.to, text: reply.text }),
    },
    {
        name: 'bluebubbles', className: 'BluebubblesAdapter',
        envKeys: ['BLUEBUBBLES_PASSWORD'],
        routePath: () => '/webhook',
        buildOpts: (self, opts) => { self.token = opts.token || env('BLUEBUBBLES_PASSWORD'); self.api = opts.api || 'http://localhost:1234/api/v1/message/text' },
        requireBeforeStart: (self) => !!self.token,
        parseMessage: (req) => {
            const text = req.body?.text || req.body?.message?.text || req.body?.content || ''
            const from = req.body?.from || req.body?.user_id || req.body?.sender_id || ''
            return { from: String(from), text, raw: req.body }
        },
        sendGuard: (self) => { if (!self.token) throw new Error('BluebubblesAdapter: token required') },
        sendUrl: (self) => self.api,
        sendHeaders: (self) => ({ authorization: `Bearer ${self.token}`, 'content-type': 'application/json' }),
        sendBody: (self, reply) => ({ to: reply.to, text: reply.text }),
    },
]

export default {
    name: 'platform-providers',
    surfaces: 'pi',
    register({ pi }) {
        for (const cfg of DESCRIPTORS) {
            const cls = createWebhookPlatform(cfg)
            pi.platforms.register({ name: cfg.name, module: { [cfg.className]: cls } })
        }
        pi.platforms.register({ name: 'sms', module: { SmsAdapter } })
        pi.platforms.register({ name: 'email', module: { EmailAdapter } })
    },
}
