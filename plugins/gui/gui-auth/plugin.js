import { listAuthProviders, isKnownAuthProvider, envForProvider, hasUsableSecret, getAuthStore, clearProviderAuth, tokenFingerprint } from '../../../src/auth.js'

// Dashboard key management. Mirrors the `freddie auth` CLI verbs so users can
// set/inspect/remove provider API keys from the web UI without env vars or a
// restart. GET never returns raw secret values — only presence, source, and a
// masked fingerprint.
async function providerState(p) {
    const env = envForProvider(p) || ''
    const inEnv = !!(env && process.env[env])
    const stored = inEnv ? null : await getAuthStore().getCredential(env)
    const value = inEnv ? process.env[env] : (stored?.value || '')
    return {
        provider: p,
        env,
        set: await hasUsableSecret(p),
        source: inEnv ? 'env' : (stored ? 'stored' : 'none'),
        fingerprint: value ? tokenFingerprint(value) : '',
    }
}

export default {
    name: 'gui-auth',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/auth', async (_, res) => {
            const rows = []
            for (const p of listAuthProviders()) rows.push(await providerState(p))
            res.json(rows)
        })
        gui.route('POST', '/api/auth', async (req, res) => {
            const { provider, key } = req.body || {}
            if (!isKnownAuthProvider(provider)) return res.status(400).json({ error: 'unknown provider', known: listAuthProviders() })
            if (!key || typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key required' })
            const env = envForProvider(provider)
            await getAuthStore().setCredential(env, key.trim())
            res.json(await providerState(provider))
        })
        gui.route('DELETE', '/api/auth/:provider', async (req, res) => {
            const provider = req.params.provider
            if (!isKnownAuthProvider(provider)) return res.status(400).json({ error: 'unknown provider', known: listAuthProviders() })
            await clearProviderAuth(provider)
            res.json(await providerState(provider))
        })
    },
}
