import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from './home.js'

class FileAuthStore {
    constructor() { this.dir = path.join(getFreddieHome(), 'auth'); fs.mkdirSync(this.dir, { recursive: true }) }
    _path(name) {
        const resolvedPath = path.join(this.dir, name + '.json')
        // Defense in depth: confirm resolved path stays within this.dir.
        // The tool handler validates name via SAFE_NAME regex before calling
        // this method, but a double-check here catches logic errors or future
        // refactors that skip the validation layer. An invalid path is always
        // a misconfiguration or attack, never a legitimate edge case.
        if (resolvedPath !== this.dir && !resolvedPath.startsWith(this.dir + path.sep)) {
            throw new Error(`Path traversal attempt: resolved path ${resolvedPath} is not within ${this.dir}`)
        }
        return resolvedPath
    }
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
// Providers needing MORE than one credential env var (bedrock's static-credential
// path is a paired access-key-id + secret-access-key per AWS SigV4 --
// acptoapi/lib/providers/bedrock.js:31 reads process.env.AWS_SECRET_ACCESS_KEY
// directly alongside AWS_ACCESS_KEY_ID). ENV_OF stays single-var-per-provider (the
// primary/identifying credential, used for envForProvider's 1:1 contract);
// EXTRA_ENV_OF carries any ADDITIONAL required vars, keyed the same way, so
// hasUsableSecret/clearProviderAuth/listKnownEnvVars/KNOWN_SECRET_VALUES all cover
// every credential a provider needs without a per-provider hardcoded branch.
const EXTRA_ENV_OF = { bedrock: ['AWS_SECRET_ACCESS_KEY'] }

export function isKnownAuthProvider(name) { return PROVIDERS.includes(name) }
export function listAuthProviders() { return [...PROVIDERS] }
export function envForProvider(name) { return ENV_OF[name] || null }
// Every additional (non-primary) credential env var a provider needs, e.g.
// bedrock's paired AWS_SECRET_ACCESS_KEY alongside its primary AWS_ACCESS_KEY_ID.
export function extraEnvForProvider(name) { return EXTRA_ENV_OF[name] ? [...EXTRA_ENV_OF[name]] : [] }
// Dedup'd env var names across all known providers, primary AND extra (some
// providers share a primary, e.g. codex reuses OPENAI_API_KEY; some need more
// than one var, e.g. bedrock) -- used by src/host/tool-resources.js's scrubEnv()
// to strip provider credentials from a spawned subprocess env, and by
// redactSecrets()/KNOWN_SECRET_VALUES() below to mask every live credential value.
export function listKnownEnvVars() { return [...new Set([...Object.values(ENV_OF), ...Object.values(EXTRA_ENV_OF).flat()])] }

async function envVarUsable(name) {
    if (process.env[name]) return true
    const cred = await getAuthStore().getCredential(name)
    return Boolean(cred?.value)
}

export async function hasUsableSecret(provider) {
    const env = envForProvider(provider)
    if (!env) return false
    if (!(await envVarUsable(env))) return false
    for (const extra of extraEnvForProvider(provider)) { if (!(await envVarUsable(extra))) return false }
    return true
}

export async function clearProviderAuth(provider) {
    const env = envForProvider(provider)
    if (!env) return false
    await getAuthStore().deleteCredential(env)
    for (const extra of extraEnvForProvider(provider)) { await getAuthStore().deleteCredential(extra) }
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
    const extras = extraEnvForProvider(provider)
    return {
        provider,
        env: envForProvider(provider),
        extraEnv: extras.length ? extras : undefined,
        hasSecret: await hasUsableSecret(provider),
    }
}

// Field names that carry a raw secret value by convention, independent of
// whether that value happens to match a known provider env var (a
// credential_files:set call for an arbitrary/custom credential name has no
// entry in ENV_OF at all, so name-matching alone under-covers it). 'credential'
// is included despite FileAuthStore.getCredential returning {name, value,
// updated} wrapped under a 'credential' key (credential_files:get's result
// shape, where `name` is normally just the identifier and `updated` a
// timestamp) -- a caller can also hold a bare secret STRING directly under a
// key literally named `credential` (not nested under `value`), so excluding
// 'credential' entirely would under-cover that case.
//
// Once a 'credential'/'value'/etc field name is seen, EVERY string leaf in
// its subtree is masked unconditionally, with NO shape-based carve-out for
// sibling fields like `name`/`updated`. An earlier version of this file
// tried selectively unmasking `name`/`updated` for the well-known
// {name,value,updated} shape (to keep wire-log/trajectory output showing
// which credential was touched) -- two adversarial passes found this
// unsafe: (1) trusting `name` as "always the identifier" has no structural
// guarantee behind it -- a confused/malicious credential_files:set call
// can place the actual secret payload in `name` instead of `value`, and (2)
// running `name`'s string through the exact-match/embedded-substring scan
// as a fallback still only catches a secret that happens to already be a
// live process.env value -- an arbitrary/custom credential's secret content
// is by definition NOT in process.env (same under-coverage this file's own
// opening comment already names), so the scan gives no real protection.
// There is no way to distinguish "name legitimately holds an identifier"
// from "name happens to hold the secret" from field name or shape alone;
// mask-all under a secret-shaped key is the only sound default. The
// observability loss (wire logs no longer show which credential a
// tool.start/tool.end touched) is an accepted, disclosed tradeoff -- never
// silently reopen this as a "nice to have" without a structural way to
// prove the unmasked field cannot carry a secret.
const SECRET_FIELD_NAMES = new Set(['value', 'credential', 'apikey', 'api_key', 'token', 'secret', 'password', 'auth_token'])

const KNOWN_SECRET_VALUES = () => new Set(listKnownEnvVars().map(envVar => process.env[envVar]).filter(Boolean))

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
    const walk = (node, keyHint, depth) => {
        if (depth > MAX_REDACT_DEPTH) return '[redacted: max depth exceeded]'
        const underSecretField = keyHint && SECRET_FIELD_NAMES.has(String(keyHint).toLowerCase())
        if (underSecretField) return maskAllStrings(node, depth)
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
