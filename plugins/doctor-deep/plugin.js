// `freddie doctor --deep [--unsafe]` — dispatches a minimal synthetic call to
// every registered tool's handler with schema-derived dummy args, reporting
// pass/threw/timeout per tool without mutating real state. Destructive verbs
// (bash/write/edit/etc) are skipped by default -- pass --unsafe to include them.
const UNSAFE_TOOLSETS = new Set(['core'])
const UNSAFE_NAMES = new Set(['bash', 'write', 'edit', 'file_operations', 'terminal', 'code_execution', 'delegate', 'cronjob', 'send_message', 'credential_files'])

function dummyFor(schema) {
    const props = schema?.parameters?.properties || {}
    const out = {}
    for (const [k, spec] of Object.entries(props)) {
        switch (spec.type) {
            case 'number': case 'integer': out[k] = 0; break
            case 'boolean': out[k] = false; break
            case 'array': out[k] = []; break
            case 'object': out[k] = {}; break
            default: out[k] = spec.enum?.[0] ?? ''
        }
    }
    return out
}

async function dispatchWithTimeout(pi, name, args, timeoutMs = 5000) {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    return Promise.race([pi.dispatchTool(name, args), timeout])
}

export async function runDeepChecks(host, { unsafe = false } = {}) {
    const rows = []
    for (const t of host.pi.tools.list()) {
        if (!unsafe && UNSAFE_NAMES.has(t.name)) { rows.push({ name: t.name, status: 'skipped', reason: 'destructive verb, pass --unsafe to include' }); continue }
        if (t.checkFn && t.checkFn(t) === false) { rows.push({ name: t.name, status: 'skipped', reason: 'requires env: ' + (t.requiresEnv || []).join(',') }); continue }
        try {
            const result = await dispatchWithTimeout(host.pi, t.name, dummyFor(t.schema))
            const parsed = (() => { try { return JSON.parse(result) } catch { return result } })()
            const threw = parsed && typeof parsed === 'object' && 'error' in parsed
            rows.push({ name: t.name, status: threw ? 'threw' : 'pass', detail: threw ? parsed.error : undefined })
        } catch (e) {
            rows.push({ name: t.name, status: e.message === 'timeout' ? 'timeout' : 'threw', detail: String(e.message || e) })
        }
    }
    return rows
}

export default {
    name: 'doctor-deep', surfaces: 'pi',
    register({ pi, host }) {
        pi.cli.register({
            name: 'doctor-deep',
            description: 'Synthetic dry-run of every registered tool (schema-derived dummy args). Add --unsafe to include destructive verbs.',
            options: [{ flag: '--unsafe', default: false }],
            action: async (opts) => {
                const rows = await runDeepChecks(host, { unsafe: !!opts.unsafe })
                for (const r of rows) console.log(`  [${r.status.padEnd(7)}] ${r.name.padEnd(24)} ${r.reason || r.detail || ''}`)
                const failed = rows.filter(r => r.status === 'threw' || r.status === 'timeout')
                console.log(`\n${rows.length} tools checked, ${failed.length} failed, ${rows.filter(r => r.status === 'skipped').length} skipped`)
                if (failed.length) process.exitCode = 1
            },
        })
    },
}
