import { getConfigValue } from '../config.js'
import { resolveKey } from '../agent/credential_sources.js'
export async function activeRuntime() {
    const provider = getConfigValue('agent.provider', 'anthropic')
    const model = getConfigValue('agent.model', '')
    const key = await resolveKey(provider)
    return { provider, model, hasKey: key.value != null, keySource: key.source }
}
export const KNOWN_RUNTIMES = ['anthropic', 'openai', 'google', 'xai', 'groq', 'openrouter', 'deepseek', 'mistral', 'lmstudio', 'ollama']
