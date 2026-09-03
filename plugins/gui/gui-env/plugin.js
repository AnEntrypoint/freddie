import { getAuthStore } from '../../../src/auth.js'
const ENV_KEYS = ['ANTHROPIC_API_KEY','OPENAI_API_KEY','GROQ_API_KEY','OPENROUTER_API_KEY','TELEGRAM_BOT_TOKEN','DISCORD_BOT_TOKEN','SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET','WHATSAPP_API_TOKEN','SIGNAL_CLI_URL','MATRIX_HOMESERVER','MATTERMOST_URL','HONCHO_API_KEY','MEM0_API_KEY','SUPERMEMORY_API_KEY','BYTEROVER_API_KEY','HINDSIGHT_API_KEY','OPENVIKING_API_KEY','RETAINDB_API_KEY','SERPAPI_KEY','REPLICATE_API_TOKEN','SMTP_HOST','TWILIO_SID','HASS_TOKEN']
export default {
    name: 'gui-env', surfaces: 'gui',
    register({ gui }) {
        // A key set via `freddie auth set` (or the dashboard) lives in the auth
        // store, not process.env. Report it as set with its source so the env
        // page reflects the real key state, not just the shell environment.
        gui.route('GET', '/api/env', async (_, res) => {
            const store = getAuthStore()
            const out = []
            for (const k of ENV_KEYS) {
                if (process.env[k]) { out.push({ key: k, set: true, source: 'env' }); continue }
                const cred = await store.getCredential(k)
                out.push({ key: k, set: !!cred?.value, source: cred?.value ? 'stored' : 'none' })
            }
            res.json(out)
        })
    },
}
