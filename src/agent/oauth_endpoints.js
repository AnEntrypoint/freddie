import { decodeJwtClaims } from '../auth.js'

const KIMI_BASE_URLS = {
    intl: 'https://api.moonshot.ai/v1',
    cn: 'https://api.moonshot.cn/v1',
}

const ZAI_BASE_URLS = {
    bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
    z: 'https://api.z.ai/api/paas/v4',
}

export function resolveKimiBaseUrl({ region } = {}) {
    if (process.env.KIMI_BASE_URL) return process.env.KIMI_BASE_URL
    const r = (region || process.env.KIMI_REGION || 'intl').toLowerCase()
    return KIMI_BASE_URLS[r] || KIMI_BASE_URLS.intl
}

export function resolveZaiBaseUrl({ endpoint } = {}) {
    if (process.env.ZAI_BASE_URL) return process.env.ZAI_BASE_URL
    const e = (endpoint || process.env.ZAI_ENDPOINT || '').toLowerCase()
    if (e.includes('z.ai')) return ZAI_BASE_URLS.z
    if (e.includes('bigmodel')) return ZAI_BASE_URLS.bigmodel
    return ZAI_BASE_URLS.bigmodel
}

export async function detectZaiEndpoint(apiKey) {
    if (!apiKey) return 'bigmodel'
    for (const [name, base] of Object.entries(ZAI_BASE_URLS)) {
        try {
            const res = await fetch(base + '/models', { headers: { authorization: 'Bearer ' + apiKey }, signal: AbortSignal.timeout(3000) })
            if (res.ok) return name
        } catch {}
    }
    return 'bigmodel'
}

export function isCodexAccessTokenExpiring(token, { skewSeconds = 60 } = {}) {
    const claims = decodeJwtClaims(typeof token === 'string' ? token : (token?.access_token || ''))
    if (!claims) return true
    if (!claims.exp) return false
    return claims.exp - Math.floor(Date.now() / 1000) < skewSeconds
}

export async function refreshOauthToken({ tokenUrl, clientId, refreshToken, clientSecret } = {}) {
    if (!tokenUrl || !refreshToken) throw new Error('tokenUrl and refreshToken required')
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    if (clientId) body.set('client_id', clientId)
    if (clientSecret) body.set('client_secret', clientSecret)
    const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    if (!res.ok) throw new Error('refresh failed: ' + res.status + ' ' + await res.text())
    const j = await res.json()
    if (j.expires_in && !j.expires_at) j.expires_at = Math.floor(Date.now() / 1000) + j.expires_in
    return j
}

export function buildAuthorizeUrl({ authorizeUrl, clientId, redirectUri, scope, state, codeChallenge, codeChallengeMethod = 'S256' } = {}) {
    const u = new URL(authorizeUrl)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    if (scope) u.searchParams.set('scope', scope)
    if (state) u.searchParams.set('state', state)
    if (codeChallenge) { u.searchParams.set('code_challenge', codeChallenge); u.searchParams.set('code_challenge_method', codeChallengeMethod) }
    return u.toString()
}

export async function exchangeCodeForToken({ tokenUrl, clientId, code, redirectUri, codeVerifier, clientSecret } = {}) {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId })
    if (codeVerifier) body.set('code_verifier', codeVerifier)
    if (clientSecret) body.set('client_secret', clientSecret)
    const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    if (!res.ok) throw new Error('token exchange failed: ' + res.status + ' ' + await res.text())
    const j = await res.json()
    if (j.expires_in && !j.expires_at) j.expires_at = Math.floor(Date.now() / 1000) + j.expires_in
    return j
}

export { KIMI_BASE_URLS, ZAI_BASE_URLS }
