import crypto from 'node:crypto'
export function hmacSign(secret, body) { return crypto.createHmac('sha256', secret).update(body).digest('hex') }
export function hmacVerify(secret, body, signature) {
    const expected = hmacSign(secret, body)
    try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature))) } catch { return false }
}
export function aesEncrypt(key, plaintext) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex').slice(0, 32), iv)
    return iv.toString('hex') + ':' + cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex')
}
export function aesDecrypt(key, ciphertext) {
    const [iv, data] = String(ciphertext).split(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex').slice(0, 32), Buffer.from(iv, 'hex'))
    return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8')
}
export function parseSignedQuery(query, secret, sigParam = 'signature') {
    const sig = query[sigParam]
    if (!sig) return { valid: false, reason: 'no signature' }
    const sorted = Object.keys(query).filter(k => k !== sigParam).sort().map(k => k + '=' + query[k]).join('&')
    return { valid: hmacVerify(secret, sorted, sig), payload: query }
}
export function rateLimitWindow(map, key, windowMs = 1000) {
    const last = map.get(key) || 0; const now = Date.now()
    if (now - last < windowMs) return { allowed: false, retryIn: windowMs - (now - last) }
    map.set(key, now); return { allowed: true }
}
