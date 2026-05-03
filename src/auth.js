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
