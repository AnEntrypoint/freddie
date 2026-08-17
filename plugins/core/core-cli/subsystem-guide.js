// Subsystem Guide keyword table from AGENTS.md, kept inline since AGENTS.md
// is prose (not machine-parseable) and this is a best-effort match only.
// Kept in sync with AGENTS.md's "Substrate (do not reimplement)" section:
// pi-coding-agent/pi-agent-core are NOT installed dependencies of freddie —
// do not point contributors at them as the agent-loop/CLI location.
export const SUBSYSTEM_GUIDE = [
    ['agent loop', 'src/agent/machine.js (freddie-original xstate turn loop; pi-agent-core is not installed)'],
    ['cli', 'bin/freddie.js (commander) + src/tui/index.js (pi-tui, or the readline REPL fallback)'],
    ['tool', 'plugins/<name>/{plugin,handler}.js (no src/tools/)'],
    ['toolset', 'src/toolsets.js'],
    ['session', 'src/sessions.js (libsql + FTS5, async API)'],
    ['home', 'src/home.js'], ['profile', 'src/home.js'],
    ['project', 'src/projects.js (isolated FREDDIE_HOME per project)'],
    ['logging', 'src/observability/log.js'], ['observability', 'src/observability/log.js'],
    ['config', 'src/config.js'],
    ['command', 'src/commands/registry.js'],
    ['skin', 'src/skin/engine.js'],
    ['gateway', 'src/gateway/run.js + plugins/platform-*/'], ['platform', 'src/gateway/run.js + plugins/platform-*/'],
    ['acp', 'src/acp/server.js (JSON-RPC stdio)'],
    ['tui', 'src/tui/index.js + src/tui/app.js (built on pi-tui primitives)'],
    ['plugin', 'src/plugins/manager.js + src/agent/memory_provider.js + plugins/memory-*/'],
    ['memory', 'src/plugins/manager.js + src/agent/memory_provider.js + plugins/memory-*/'],
    ['skill', 'src/skills/index.js — content drops into ~/.freddie/skills/'],
    ['compress', 'src/agent/compress/{tokens,policy,prompt,prune,fallback,compressor,index}.js'],
    ['documentation', 'website/ (flatspace + content/pages/*.yaml + theme.mjs)'], ['website', 'website/ (flatspace + content/pages/*.yaml + theme.mjs)'],
    ['cron', 'src/cron/{scheduler,cron-parse}.js (async API)'],
    ['batch', 'src/batch.js'],
    ['sandbox', 'src/tools/environments/{local,docker,ssh}.js'], ['execution environment', 'src/tools/environments/{local,docker,ssh}.js'],
    ['dashboard', 'src/web/{server,app,state,routes,index.html} — thin mount over anentrypoint-design SDK'], ['gui', 'src/web/{server,app,state,routes,index.html}'],
    ['auth', 'src/auth.js (FileAuthStore) + pi-ai key resolution'], ['key', 'src/auth.js (FileAuthStore) + pi-ai key resolution'],
    ['context', 'src/context/engine.js'],
    ['browser', 'plugins/web/lib/browse.js (puppeteer-core, lazy)'],
    ['llm', 'src/agent/llm_resolver.js (thin shim over acptoapi.chat)'], ['model', 'src/agent/llm_resolver.js (thin shim over acptoapi.chat)'],
    ['i18n', 'no infra yet'], ['locale', 'no infra yet'],
    ['verify', 'manual testing via CLI (freddie exec, freddie dashboard) — no automated test framework by design'],
]

export function linkSubsystem(text) {
    const lower = String(text || '').toLowerCase()
    for (const [kw, loc] of SUBSYSTEM_GUIDE) if (lower.includes(kw)) return loc
    return null
}
