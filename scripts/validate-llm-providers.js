#!/usr/bin/env node
// validate-llm-providers.js — real LLM round-trip across configured providers.
// Run: node scripts/validate-llm-providers.js
//   With LIVE_LLM=1 set, prints a pass/fail table.
//   Always exits 0 unless --strict is set (then non-zero if all fail).
//
// Probes claude-cli, kilo, opencode, plus first 5 sampler-available API providers
// from the model_preference / .env keyed set. Sends a fixed "reply REAL_OK" prompt.
import { resolveCallLLM } from '../src/agent/llm_resolver.js'
import { listKnownProviders, discoverAndPersist } from '../src/agent/model-discovery.js'
import { isAvailable, getStatus } from '../src/agent/model-sampler.js'

const TARGETS = []
const cliBackends = ['claude-cli', 'kilo', 'opencode']
for (const p of cliBackends) TARGETS.push({ provider: p, model: undefined })
const want = ['groq', 'cerebras', 'openrouter', 'gemini', 'anthropic', 'openai', 'xai', 'mistral']
for (const p of want) if (listKnownProviders().includes(p)) TARGETS.push({ provider: p, model: undefined })

const PROMPT = 'Reply with exactly the four characters: REAL_OK'

function fmt(s, n) { return String(s ?? '').slice(0, n).padEnd(n) }
function ok(s) { return /REAL_OK/i.test(s || '') }

const strict = process.argv.includes('--strict')
const liveOnly = !process.env.LIVE_LLM || process.env.LIVE_LLM === '0'

if (liveOnly) {
    console.log('LIVE_LLM not set (=0); printing target plan only, no network calls.')
    console.log('Would test', TARGETS.length, 'providers:', TARGETS.map(t => t.provider).join(', '))
    console.log('Set LIVE_LLM=1 to actually probe.')
    process.exit(0)
}

const rows = []
for (const t of TARGETS) {
    const t0 = Date.now()
    let result = '', err = null
    try {
        const call = resolveCallLLM({ provider: t.provider, model: t.model })
        const out = await call({ messages: [{ role: 'user', content: PROMPT }] })
        result = String(out?.content || '').trim()
    } catch (e) { err = String(e.message || e) }
    rows.push({ provider: t.provider, ms: Date.now() - t0, ok: !err && ok(result), result: result || err || '(no response)' })
}

console.log('\n' + 'provider'.padEnd(14), 'ms'.padEnd(6), 'ok'.padEnd(4), 'first 60')
console.log('-'.repeat(80))
for (const r of rows) console.log(fmt(r.provider, 14), fmt(r.ms, 6), fmt(r.ok ? 'YES' : 'no', 4), fmt(r.result.replace(/\s+/g, ' '), 60))
console.log('\nsampler status:', getStatus().map(s => `${s.provider}:ok=${s.ok}/fails=${s.failCount}`).join(', '))

const passCount = rows.filter(r => r.ok).length
console.log(`\n${passCount} / ${rows.length} providers returned REAL_OK`)
if (strict && passCount === 0) process.exit(1)
