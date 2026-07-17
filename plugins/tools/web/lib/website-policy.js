// Per-host fetch policy (rate limit, allow/deny), read from
// config.website_policy. Applied alongside url-safety as a pre-flight gate
// on the web plugin's network-issuing tools (fetch, browse).
import { getConfigValue } from '../../../../src/config.js'

export function checkWebsitePolicy(url) {
    const policy = getConfigValue('website_policy', { allow: [], deny: [], ratelimit_ms: 1000 }) || {}
    const u = new URL(url)
    if (policy.deny?.some(d => u.hostname.includes(d))) return { decision: 'deny' }
    if (policy.allow?.length && !policy.allow.some(a => u.hostname.includes(a))) return { decision: 'deny', reason: 'not in allow list' }
    return { decision: 'allow', ratelimit_ms: policy.ratelimit_ms || 1000 }
}
