import { getConfigValue, saveConfigValue } from '../config.js'
import { getAuthStore } from '../auth.js'
const STEPS = ['provider', 'api-key', 'model', 'skin', 'memory']
export async function isOnboardingComplete() { return Boolean(getConfigValue('onboarding.completed')) }
export async function nextStep() {
    if (!getConfigValue('agent.provider')) return 'provider'
    const provider = getConfigValue('agent.provider')
    const env = (provider || '').toUpperCase() + '_API_KEY'
    if (!process.env[env] && !(await getAuthStore().getCredential(env))) return 'api-key'
    if (!getConfigValue('agent.model')) return 'model'
    if (!getConfigValue('display.skin')) return 'skin'
    if (!getConfigValue('memory.provider')) return 'memory'
    return null
}
export async function markComplete() { saveConfigValue('onboarding.completed', Date.now()) }
export const ONBOARDING_STEPS = STEPS
