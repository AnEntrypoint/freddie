#!/usr/bin/env node
import { createRequire } from 'module'
import { resolveCallLLM } from '../src/agent/llm_resolver.js'
import { isAvailable, getStatus } from '../src/agent/model-sampler.js'
import fs from 'node:fs'
import path from 'node:path'
const _require = createRequire(import.meta.url)
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')
const ENV_PATH = path.join(ROOT, '.env')
const LOG_PATH = path.join(ROOT, '.gm', 'llm-validation.log')
const JSON_PATH = path.join(ROOT, '.gm', 'llm-validation.json')
const PROMPT = 'Reply with exactly the four characters: REAL_OK'
const PER_PROVIDER_TIMEOUT_MS = 45000

function loadEnv() {
    if (!fs.existsSync(ENV_PATH)) return {}
    const out = {}
    for (const ln of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
        const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(ln.trim())
        if (m && !process.env[m[1]]) { process.env[m[1]] = m[2]; out[m[1]] = m[2] }
        else if (m) out[m[1]] = process.env[m[1]] }
    return out
}

function envKeyToProvider() {
    let PK = {}
    try { ({ PROVIDER_KEYS: PK } = _require('acptoapi/lib/provider-maps')) }
    catch { try { ({ PROVIDER_KEYS: PK } = _require('../../acptoapi/lib/provider-maps')) } catch { PK = {} } }
    const inv = {}
    for (const [provider, envKey] of Object.entries(PK)) inv[envKey] = provider
    return inv
}

async function probeAcp(name, base) {
    try {
        const r = await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) })
        return r.ok
    } catch { return false }
}

async function probeOne(provider, model) {
    const t0 = Date.now()
    try {
        const call = resolveCallLLM({ provider, model })
        const out = await Promise.race([
            call({ messages: [{ role: 'user', content: PROMPT }] }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), PER_PROVIDER_TIMEOUT_MS)),
        ])
        const content = String(out?.content || '').trim()
        return { provider, model, ok: /REAL_OK/i.test(content), ms: Date.now() - t0, excerpt: content.slice(0, 200), error: null }
    } catch (e) { return { provider, model, ok: false, ms: Date.now() - t0, excerpt: '', error: String(e.message || e).slice(0, 300) } }
}

async function main() {
    loadEnv()
    const inv = envKeyToProvider()
    const envKeys = Object.keys(loadEnv())
    const seen = new Set()
    const targets = []
    for (const k of envKeys) { const p = inv[k]; if (p && !seen.has(p)) { seen.add(p); targets.push({ provider: p, source: 'env:' + k }) } }
    for (const acp of ['kilo', 'opencode']) {
        const base = acp === 'kilo' ? 'http://localhost:4780' : 'http://localhost:4790'
        const up = await probeAcp(acp, base)
        targets.push({ provider: acp, source: 'acp-daemon', daemonUp: up })
    }
    targets.push({ provider: 'claude-cli', source: 'cli' })
    const rows = []
    for (const t of targets) {
        const r = await probeOne(t.provider, undefined)
        r.source = t.source; r.daemonUp = t.daemonUp
        rows.push(r)
    }
    const sampler = getStatus()
    const summary = {
        timestamp: new Date().toISOString(),
        env_keys: envKeys,
        targets: targets.map(t => ({ provider: t.provider, source: t.source, daemonUp: t.daemonUp ?? null })),
        results: rows,
        sampler,
        pass_count: rows.filter(r => r.ok).length,
        total: rows.length,
    }
    fs.writeFileSync(JSON_PATH, JSON.stringify(summary, null, 2))
    const lines = []
    lines.push(`# LLM provider validation — ${summary.timestamp}`)
    lines.push(`# env keys: ${envKeys.length} (${envKeys.join(', ')})`)
    lines.push(`# targets: ${targets.length}; passed: ${summary.pass_count}/${rows.length}`)
    lines.push('')
    lines.push('provider'.padEnd(16) + 'ok'.padEnd(5) + 'ms'.padEnd(8) + 'source'.padEnd(20) + 'excerpt/error')
    lines.push('-'.repeat(120))
    for (const r of rows) {
        const tail = r.ok ? r.excerpt : (r.error || '(no response)')
        lines.push(`${r.provider.padEnd(16)}${(r.ok ? 'YES' : 'no').padEnd(5)}${String(r.ms).padEnd(8)}${String(r.source).padEnd(20)}${tail.replace(/\s+/g, ' ').slice(0, 80)}`)
    }
    lines.push('')
    lines.push('# sampler:')
    for (const s of sampler) lines.push(`  ${s.provider}: ok=${s.ok} fails=${s.failCount}`)
    fs.writeFileSync(LOG_PATH, lines.join('\n'))
    console.log(lines.join('\n'))
    console.log('\nartifacts:', LOG_PATH, JSON_PATH)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
