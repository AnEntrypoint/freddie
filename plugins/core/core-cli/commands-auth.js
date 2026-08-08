import { listAuthProviders, isKnownAuthProvider, envForProvider, hasUsableSecret, getAuthStore, clearProviderAuth, tokenFingerprint } from '../../../src/auth.js'
import { readStdinSecret } from '../../../src/cli/stdin_secret.js'

export function registerAuthCommand(C) {
    C({ name: 'auth', description: 'Manage provider API keys (list|set <provider>|rm <provider>|test [provider]|show)', args: [{ name: 'action', default: 'list' }, { name: 'provider' }], action: async (action, provider) => {
        const known = (p) => { if (!isKnownAuthProvider(p)) { console.error(`unknown provider: ${p}\nknown: ${listAuthProviders().join(', ')}`); process.exit(1) } }
        if (action === 'list' || action === 'show') {
            for (const p of listAuthProviders()) {
                const env = envForProvider(p) || ''
                const inEnv = !!(env && process.env[env])
                const stored = !inEnv && !!(await getAuthStore().getCredential(env))
                const src = inEnv ? 'env' : (stored ? 'stored' : 'none')
                console.log(`${p.padEnd(12)} ${env.padEnd(22)} ${(await hasUsableSecret(p)) ? '[set]' : '[--]'} (${src})`)
            }
            return
        }
        if (action === 'set') {
            known(provider)
            const env = envForProvider(provider)
            const key = await readStdinSecret(`${env} (key, hidden): `)
            if (!key) { console.error('no key provided'); process.exit(1) }
            await getAuthStore().setCredential(env, key)
            console.log(`stored ${env} (${tokenFingerprint(key)})`)
            return
        }
        if (action === 'rm') { known(provider); await clearProviderAuth(provider); console.log(`removed key for ${provider}`); return }
        if (action === 'test') {
            const sdk = await import('acptoapi').catch(() => null)
            const targets = provider ? [provider] : listAuthProviders()
            for (const p of targets) {
                if (provider) known(p)
                const has = await hasUsableSecret(p)
                if (!has) { console.log(`${p.padEnd(12)} [--] no key`); continue }
                let reachable = true
                try { if (sdk?.isAvailable) reachable = sdk.isAvailable(p) } catch {}
                console.log(`${p.padEnd(12)} ${reachable ? '[ok]' : '[backoff]'} key present`)
            }
            return
        }
        console.error('usage: freddie auth [list|set <provider>|rm <provider>|test [provider]|show]'); process.exit(1)
    } })

    C({ name: 'mcp', description: 'Manage MCP servers (auth <server>|auth --token <server> <tk>|auth --list|auth --remove <server>)', args: [{ name: 'action', default: 'auth' }, { name: 'server' }, { name: 'token' }], options: [{ flag: '--token', default: false }, { flag: '--list', default: false }, { flag: '--remove', default: false }], action: async (action, server, token, opts) => {
        if (action !== 'auth') { console.error('usage: freddie mcp auth [<server>|--token <server> <tk>|--list|--remove <server>]'); process.exit(1); return }
        const { getMcpOAuthManager } = await import('../../core/mcp/lib/oauth-manager.js')
        const mgr = getMcpOAuthManager()

        if (opts.list) {
            const servers = await mgr.listServers()
            if (!servers.length) { console.log('(no MCP servers with stored OAuth tokens)'); return }
            for (const s of servers) console.log(s)
            return
        }
        if (opts.remove) {
            if (!server) { console.error('usage: freddie mcp auth --remove <server>'); process.exit(1); return }
            await mgr.removeToken(server)
            console.log(`removed OAuth token for ${server}`)
            return
        }
        if (opts.token) {
            if (!server || !token) { console.error('usage: freddie mcp auth --token <server> <token>'); process.exit(1); return }
            await mgr.storeToken(server, { accessToken: token })
            console.log(`stored OAuth token for ${server}`)
            return
        }
        // Default: start OAuth flow for <server>
        if (!server) { console.error('usage: freddie mcp auth <server>\n       freddie mcp auth --token <server> <tk>\n       freddie mcp auth --list\n       freddie mcp auth --remove <server>'); process.exit(1); return }
        console.log(`OAuth flow for ${server}: not yet implemented (use --token to store a token directly)`)
    } })
}
