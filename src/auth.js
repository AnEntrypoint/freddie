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
// 'credential' IS included, deliberately, despite FileAuthStore.getCredential
// returning {name, value, updated} wrapped under a 'credential' key
// (credential_files:get's result shape) -- an earlier version of this file
// excluded 'credential' to keep the sibling `name`/`updated` fields legible
// in that specific shape, but that traded away real coverage: a caller can
// also legitimately hold a bare secret STRING directly under a key literally
// named `credential` (not nested under a further `value` key), and excluding
// 'credential' left that case masked only by the env-var exact-match/
// substring path, which under-covers exactly the arbitrary/custom-credential
// case this comment already calls out. Keep 'credential' in the set (safe
// default: mask the whole subtree) and let CREDENTIAL_RESULT_KEYS below
// carve out the one well-known shape where selective unmasking is safe.
const SECRET_FIELD_NAMES = new Set(['value', 'credential', 'apikey', 'api_key', 'token', 'secret', 'password', 'auth_token'])

// The exact {name, value, updated} shape FileAuthStore.getCredential/
// credential_files:get returns. When a 'credential'-keyed node has EXACTLY
// this shape, `name` (the credential's identifier, e.g. "ANTHROPIC_API_KEY")
// and `updated` (a timestamp) are not secret content -- only `value` is --
// so this one well-known shape is unmasked selectively instead of via the
// generic mask-the-whole-subtree default, restoring wire-log/trajectory
// observability without reopening the bare-string-under-credential leak the
// generic exclusion caused.
const CREDENTIAL_RESULT_KEYS = new Set(['name', 'value', 'updated'])
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
// Depth cap for the recursive walk below. Every real caller's input is
// tool-call args/results that already crossed a JSON.parse boundary
// upstream (an LLM provider's tool-call payload, a JSON-serializable tool
// handler return value) -- JSON.parse can never produce a circular
// reference or pathological depth, so this never fires on any real input.
// It exists as a worst-case bound (gm SPECIFY's "optimize the worst case,
// not the average, bound it explicitly in the code") in case a future
// caller passes something else, converting an unbounded-recursion crash
// into a graceful degrade-to-fingerprint on the excess depth.
const MAX_REDACT_DEPTH = 64

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
    const maskAllStrings = (node, depth) => {
        if (depth > MAX_REDACT_DEPTH) return '[redacted: max depth exceeded]'
        if (typeof node === 'string') return node ? tokenFingerprint(node) : node
        if (Array.isArray(node)) return node.map(v => maskAllStrings(v, depth + 1))
        if (node && typeof node === 'object') {
            const out = {}
            for (const [k, v] of Object.entries(node)) out[k] = maskAllStrings(v, depth + 1)
            return out
        }
        return node
    }
    // credential_files:get's exact {name, value, updated} result shape: unmask
    // `name`/`updated` selectively (still redacting `value` via the normal
    // SECRET_FIELD_NAMES path below) instead of mask-all-ing the whole node,
    // since those two fields are never secret content. Any OTHER shape under
    // a 'credential' key (a bare string, an object with different keys) is
    // NOT this well-known shape and falls through to the safe mask-all
    // default.
    const isCredentialResultShape = (node) =>
        node && typeof node === 'object' && !Array.isArray(node) &&
        Object.keys(node).length > 0 && Object.keys(node).every(k => CREDENTIAL_RESULT_KEYS.has(k))
    const walk = (node, keyHint, depth) => {
        if (depth > MAX_REDACT_DEPTH) return '[redacted: max depth exceeded]'
        const underSecretField = keyHint && SECRET_FIELD_NAMES.has(String(keyHint).toLowerCase())
        if (underSecretField) {
            if (String(keyHint).toLowerCase() === 'credential' && isCredentialResultShape(node)) {
                const out = {}
                for (const [k, v] of Object.entries(node)) out[k] = k === 'value' ? maskAllStrings(v, depth + 1) : v
                return out
            }
            return maskAllStrings(node, depth)
        }
        if (typeof node === 'string') {
            if (known.includes(node)) return tokenFingerprint(node)
            return redactEmbedded(node)
        }
        if (Array.isArray(node)) return node.map(v => walk(v, keyHint, depth + 1))
        if (node && typeof node === 'object') {
            const out = {}
            for (const [k, v] of Object.entries(node)) out[k] = walk(v, k, depth + 1)
            return out
        }
        return node
    }
    return walk(input, null, 0)
}
