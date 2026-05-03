import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { getAuthStore } from '../auth.js'
const ENV_MAP = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', mistral: 'MISTRAL_API_KEY', deepseek: 'DEEPSEEK_API_KEY' }
export async function resolveKey(provider) {
    const env = ENV_MAP[provider] || (provider.toUpperCase() + '_API_KEY')
    if (process.env[env]) return { source: 'env', value: process.env[env] }
    const stored = await getAuthStore().getCredential(env)
    if (stored?.value) return { source: 'auth-store', value: stored.value }
    const dotEnv = path.join(getFreddieHome(), '.env')
    if (fs.existsSync(dotEnv)) {
        const m = fs.readFileSync(dotEnv, 'utf8').match(new RegExp('^' + env + '=(.+)$', 'm'))
        if (m) return { source: 'dotenv', value: m[1].replace(/^["']|["']$/g, '') }
    }
    return { source: 'none', value: null }
}
export function listProviders() { return Object.keys(ENV_MAP) }
