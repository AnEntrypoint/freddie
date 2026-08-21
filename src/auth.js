import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from './home.js'

class FileAuthStore {
    constructor() { this.dir = path.join(getFreddieHome(), 'auth'); fs.mkdirSync(this.dir, { recursive: true }) }
    _path(name) { return path.join(this.dir, name + '.json') }
    async setCredential(name, value) {
        fs.writeFileSync(this._path(name), JSON.stringify({ name, value, updated: Date.now() }), { encoding: 'utf8', mode: 0o600 })
        return { name, stored: true }
    }
    async getCredential(name) {
        const p = this._path(name)
        if (!fs.existsSync(p)) return null
        return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
    async listCredentials() {
        return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    }
    async deleteCredential(name) {
        const p = this._path(name)
        if (fs.existsSync(p)) fs.unlinkSync(p)
        return { name, deleted: true }
    }
}

let _store = null
export function getAuthStore() {
    if (!_store) _store = new FileAuthStore()
    return _store
}
export function resetAuthStoreForTests() { _store = null }

const PROVIDERS = ['anthropic', 'openai', 'groq', 'openrouter', 'xai', 'gemini', 'bedrock', 'codex', 'kimi', 'zai', 'deepseek', 'mistral', 'perplexity']
const ENV_OF = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', xai: 'XAI_API_KEY', gemini: 'GEMINI_API_KEY', bedrock: 'AWS_ACCESS_KEY_ID', codex: 'OPENAI_API_KEY', kimi: 'KIMI_API_KEY', zai: 'ZAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', mistral: 'MISTRAL_API_KEY', perplexity: 'PERPLEXITY_API_KEY' }

export function isKnownAuthProvider(name) { return PROVIDERS.includes(name) }
export function listAuthProviders() { return [...PROVIDERS] }
export function envForProvider(name) { return ENV_OF[name] || null }
// Dedup'd env var names across all known providers (some providers share one,
// e.g. codex reuses OPENAI_API_KEY) -- used by src/host/tool-resources.js's
// scrubEnv() to strip provider credentials from a spawned subprocess env.
export function listKnownEnvVars() { return [...new Set(Object.values(ENV_OF))] }

export async function hasUsableSecret(provider) {
    const env = envForProvider(provider)
    if (!env) return false
    if (process.env[env]) return true
    const cred = await getAuthStore().getCredential(env)
    return Boolean(cred?.value)
}

export async function clearProviderAuth(provider) {
    const env = envForProvider(provider)
    if (!env) return false
    await getAuthStore().deleteCredential(env)
    return true
}

export function isExpiring(token, { skewSeconds = 60 } = {}) {
    if (!token || typeof token !== 'object') return true
    const exp = token.expires_at || token.exp
    if (!exp) return false
    const now = Math.floor(Date.now() / 1000)
    const expSec = typeof exp === 'string' ? Math.floor(new Date(exp).getTime() / 1000) : exp
    return expSec - now < skewSeconds
}

export function decodeJwtClaims(jwt) {
    if (typeof jwt !== 'string') return null
    const parts = jwt.split('.')
    if (parts.length < 2) return null
    try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

export function tokenFingerprint(token) {
    const s = typeof token === 'string' ? token : (token?.access_token || token?.value || '')
    if (!s) return ''
    return s.slice(0, 4) + '…' + s.slice(-4)
}

export async function getProviderAuthState(provider) {
    return {
        provider,
        env: envForProvider(provider),
        hasSecret: await hasUsableSecret(provider),
    }
}

// Field names that carry a raw secret value by convention, independent of
// whether that value happens to match a known provider env var (a
// credential_files:set call for an arbitrary/custom credential name has no
// entry in ENV_OF at all, so name-matching alone under-covers it).
// Deliberately excludes 'credential' itself: FileAuthStore.getCredential
// returns {name, value, updated} wrapped under a 'credential' key
// (credential_files:get's result shape), and 'credential' is a CONTAINER
// key, not a value-holding one -- masking on it would also blank the
// sibling `name` (the credential's identifier, e.g. "ANTHROPIC_API_KEY",
// not itself secret) and `updated` timestamp, destroying wire-log/
// trajectory observability for no security benefit, since `value` (still in
// this set) already correctly masks the actual secret one level deeper.
const SECRET_FIELD_NAMES = new Set(['value', 'apikey', 'api_key', 'token', 'secret', 'password', 'auth_token'])
const KNOWN_SECRET_VALUES = () => new Set(Object.values(ENV_OF).map(envVar => process.env[envVar]).filter(Boolean))

// Deep-clones `input`, replacing any string that is either (a) a live value
// of a known provider env var (exact match, ANY length -- a short custom key
// is still a real secret and must not be exempted from the exact-match path,
// only from the embedded-substring scan below, which needs a length floor to
// avoid over-matching short strings that merely happen to recur), (b) held
// under a credential-shaped field name -- recursively, so a `value`/`token`/
// etc field whose OWN value is an object/array (credential_files:set accepts
// an untyped `value: {}`) has every string leaf beneath it masked too, not
// only a direct string leaf, or (c) CONTAINS a known provider env var value
// (>=8 chars) as a substring (the bash/write/edit path: a command or file
// content embedding a real key inline, e.g. `curl -H "Authorization: Bearer
// sk-ant-..."` or a written .env file's contents, is never itself the exact
// string value -- it is a larger string the secret is embedded IN), with a
// redacted form. Never mutates its input. Used at every boundary a tool
// call's args/result can cross into a durable or external sink (wire log,
// live listeners, trajectory files, the approval classifier's LLM prompt) so
// a raw secret never leaves the dispatch site.
export function redactSecrets(input) {
    const known = [...KNOWN_SECRET_VALUES()]
    const embeddable = known.filter(v => v.length >= 8) // substring scan needs a length floor to avoid over-matching; exact-match below does not
    const redactEmbedded = (s) => {
        let out = s
        for (const secret of embeddable) { if (out.includes(secret)) out = out.split(secret).join(tokenFingerprint(secret)) }
        return out
    }
    // Once a credential-shaped field name is seen, every string leaf in its
    // subtree is masked regardless of nesting depth -- the field-name signal
    // must survive descending into an object/array value, not just gate a
    // direct string child.
    const maskAllStrings = (node) => {
        if (typeof node === 'string') return node ? tokenFingerprint(node) : node
        if (Array.isArray(node)) return node.map(maskAllStrings)
        if (node && typeof node === 'object') {
            const out = {}
            for (const [k, v] of Object.entries(node)) out[k] = maskAllStrings(v)
            return out
        }
        return node
    }
    const walk = (node, keyHint) => {
        const underSecretField = keyHint && SECRET_FIELD_NAMES.has(String(keyHint).toLowerCase())
        if (underSecretField) return maskAllStrings(node)
        if (typeof node === 'string') {
            if (known.includes(node)) return tokenFingerprint(node)
            return redactEmbedded(node)
        }
        if (Array.isArray(node)) return node.map(v => walk(v, keyHint))
        if (node && typeof node === 'object') {
            const out = {}
            for (const [k, v] of Object.entries(node)) out[k] = walk(v, k)
            return out
        }
        return node
    }
    return walk(input, null)
}
