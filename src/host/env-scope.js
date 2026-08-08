export function envVarAllowed(name, allowPatterns) {
    if (!allowPatterns || !allowPatterns.length) return true
    return allowPatterns.includes(name)
}

// Opt-in credential scrubbing for subprocess environments (bash tool,
// environments/*.js). Unlike envVarAllowed (which gates a plugin's own
// ctx.env(name) reads), this filters the FULL env object handed to a spawned
// child process -- a bash tool call otherwise inherits every provider API
// key in process.env verbatim, with no scoping at all. Reuses the same
// allowlist-pattern shape as envVarAllowed/hostAllowed for consistency, but
// here `denyNames` is a concrete list of var names to strip (typically
// auth.js's ENV_OF values) rather than an allow-pattern -- scrubbing is
// name-based, not glob-based, since credential env var names are exact and
// well-known ahead of time.
export function scrubEnv(env, denyNames) {
    if (!denyNames || !denyNames.length) return env
    const denySet = new Set(denyNames)
    const out = {}
    for (const [k, v] of Object.entries(env)) {
        if (!denySet.has(k)) out[k] = v
    }
    return out
}

// Env var read gating is enforced differently from fs/network: process.env is
// read pervasively by third-party deps freddie itself depends on (acptoapi,
// pi-ai, dotenv) via plain property access that cannot be safely proxied
// process-wide without breaking unrelated code paths. Real, viable enforcement
// scope: check a tool's OWN args object for values that look like a raw env
// var read attempt is out of reach generically, so this exports a narrow,
// explicitly-called guard a handler's ctx.env accessor can route through
// (ctx.env(name) below in host.js), rather than a transparent monkeypatch.
export function makeScopedEnvReader(resources, pluginName, toolName, logger, realEnv) {
    return (name) => {
        if (resources?.env_vars !== undefined && !envVarAllowed(name, resources.env_vars)) {
            logger?.warn?.(`capability manifest denied env read for tool '${toolName}'`, { plugin: pluginName, tool: toolName, name })
            throw new Error(`plugin '${pluginName}' tool '${toolName}': env var '${name}' not in declared env_vars allowlist [${(resources.env_vars || []).join(', ')}]`)
        }
        return realEnv[name]
    }
}
