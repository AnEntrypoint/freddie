// Resolves a single credential value for a provider by trying, in order:
// process.env -> auth store -> ~/.freddie/.env -> the acptoapi package's .env.
// PROVIDER_ENV_MAP is data (provider -> env var name); adding a provider is a
// one-line table edit, not new logic.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { getFreddieHome } from '../home.js'
import { getAuthStore } from '../auth.js'

export const PROVIDER_ENV_MAP = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', mistral: 'MISTRAL_API_KEY', deepseek: 'DEEPSEEK_API_KEY' }

function parseDotEnv(filePath, envKey) {
    if (!fs.existsSync(filePath)) return null
    const m = fs.readFileSync(filePath, 'utf8').match(new RegExp('^' + envKey + '=(.+)$', 'm'))
    return m ? m[1].replace(/^["']|["']$/g, '') : null
}
function acptoApiEnvPath() {
    try {
        const req = createRequire(import.meta.url)
        const pkgMain = req.resolve('acptoapi')
        return path.join(path.dirname(pkgMain), '.env')
    } catch { return null }
}
export async function resolveKey(provider) {
    const env = PROVIDER_ENV_MAP[provider] || (provider.toUpperCase() + '_API_KEY')
    if (process.env[env]) return { source: 'env', value: process.env[env] }
    const stored = await getAuthStore().getCredential(env)
    if (stored?.value) return { source: 'auth-store', value: stored.value }
    const frederickDotEnv = path.join(getFreddieHome(), '.env')
    const fromFreddie = parseDotEnv(frederickDotEnv, env)
    if (fromFreddie) return { source: 'dotenv', value: fromFreddie }
    const acpPath = acptoApiEnvPath()
    if (acpPath) {
        const fromAcp = parseDotEnv(acpPath, env)
        if (fromAcp) return { source: 'acptoapi-dotenv', value: fromAcp }
    }
    return { source: 'none', value: null }
}
export function listProviders() { return Object.keys(PROVIDER_ENV_MAP) }
