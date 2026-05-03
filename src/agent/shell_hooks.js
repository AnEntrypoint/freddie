import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
function hookFile() { return path.join(getFreddieHome(), 'shell-hooks.json') }
export function loadHooks() { try { return JSON.parse(fs.readFileSync(hookFile(), 'utf8')) } catch { return { pre_run: [], post_run: [] } } }
export function saveHooks(h) { fs.writeFileSync(hookFile(), JSON.stringify(h, null, 2), 'utf8') }
export function addHook(stage, command) { const h = loadHooks(); (h[stage] = h[stage] || []).push(command); saveHooks(h); return h }
export async function runHooks(stage, ctx = {}) {
    const { spawnSync } = await import('node:child_process')
    const out = []
    for (const cmd of (loadHooks()[stage] || [])) {
        const r = spawnSync(process.platform === 'win32' ? 'cmd' : 'sh', [process.platform === 'win32' ? '/c' : '-c', cmd], { encoding: 'utf8', env: { ...process.env, ...ctx.env } })
        out.push({ cmd, exitCode: r.status, stdout: r.stdout, stderr: r.stderr })
    }
    return out
}
