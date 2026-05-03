import { registry } from './registry.js'
import { getConfigValue } from '../config.js'
registry.register({
    name: 'website_policy',
    toolset: 'core',
    schema: { name: 'website_policy', description: 'Per-host fetch policy (rate limit, allow/deny). Reads config.website_policy.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    handler: async ({ url }) => {
        const policy = getConfigValue('website_policy', { allow: [], deny: [], ratelimit_ms: 1000 }) || {}
        const u = new URL(url)
        if (policy.deny?.some(d => u.hostname.includes(d))) return { decision: 'deny' }
        if (policy.allow?.length && !policy.allow.some(a => u.hostname.includes(a))) return { decision: 'deny', reason: 'not in allow list' }
        return { decision: 'allow', ratelimit_ms: policy.ratelimit_ms || 1000 }
    },
})
