// Mandatory tool I/O middleware pipeline, wired into makePi()'s dispatchTool
// in host_helpers.js. Runs on every tool call, not opt-in.
//
// Absorbs (deleted plugin dirs):
//   plugins/schema_sanitizer   -> sanitizeSchema()      (pre-call: strip dangerous schema keys)
//   plugins/tool_backend_helpers -> shapeArgs()         (pre-call: coerce args to schema+defaults; folded
//                                                         in as an internal helper, not a pipeline step —
//                                                         it was a shared arg-shaping utility, not itself
//                                                         middleware, and nothing else depended on it)
//   plugins/ansi_strip         -> stripAnsi()           (post-call: strip ANSI escapes from string output)
//   plugins/tool_output_limits -> truncate()            (post-call: cap output length)
//   plugins/tool_result_storage -> store/fetch/list/delete (post-call: persist oversized output, return a token)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getConfigValue } from '../config.js'
import { getFreddieHome } from '../home.js'
import { ansiStrip } from '../utils.js'

const DANGEROUS_PARAM_NAMES = new Set(['eval', 'exec', '__proto__', 'constructor'])

// --- schema sanitization (pre-call) ---------------------------------------
export function sanitizeSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema
    const out = JSON.parse(JSON.stringify(schema))
    if (out.parameters?.properties) {
        for (const k of Object.keys(out.parameters.properties)) {
            if (DANGEROUS_PARAM_NAMES.has(k)) delete out.parameters.properties[k]
        }
    }
    return out
}

// --- arg shaping (pre-call helper, folded from tool_backend_helpers) ------
export function shapeArgs(parameters, args) {
    if (!parameters?.properties) return args
    const out = {}
    for (const [k, def] of Object.entries(parameters.properties)) {
        if (args && k in args) out[k] = args[k]
        else if (def && 'default' in def) out[k] = def.default
    }
    return out
}

// --- ansi stripping (post-call) -------------------------------------------
export function stripAnsi(text) {
    return ansiStrip(text)
}

// --- output limits (post-call) --------------------------------------------
const HEAP_SHRINK_THRESHOLD_PCT = 80
const HEAP_SHRINK_FACTOR = 0.5

// Shrinks the configured output cap when the process is under real memory
// pressure -- a large tool result held in memory while heap usage is already
// high raises the odds of an OOM. Ratio is checked live (not cached) since
// heap usage changes turn to turn. Ported from plugins/tool_output_limits
// (origin/main a5b61b5-adjacent work) into the mandatory pipeline so every
// call benefits, not just the standalone tool_output_limits tool.
function dynamicLimit(base) {
    const mem = process.memoryUsage()
    const pct = (mem.heapUsed / mem.heapTotal) * 100
    if (pct < HEAP_SHRINK_THRESHOLD_PCT) return base
    return Math.floor(base * HEAP_SHRINK_FACTOR)
}

export function truncate(s, max = null) {
    const base = max ?? getConfigValue('tool.output_limit', 100_000)
    const limit = dynamicLimit(base)
    const t = String(s)
    if (t.length <= limit) return t
    return t.slice(0, limit) + `\n…[truncated ${t.length - limit} chars]`
}

// --- result storage (post-call, for oversized output) ---------------------
function resultsDir() {
    const d = path.join(getFreddieHome(), 'tool-results')
    fs.mkdirSync(d, { recursive: true })
    return d
}
export function storeToolResult(content) {
    const token = crypto.randomBytes(8).toString('hex')
    fs.writeFileSync(path.join(resultsDir(), token + '.txt'), content || '', 'utf8')
    return { token, bytes: (content || '').length }
}
export function fetchToolResult(token) {
    const f = path.join(resultsDir(), token + '.txt')
    return fs.existsSync(f) ? { content: fs.readFileSync(f, 'utf8') } : { error: 'not found' }
}
export function listToolResults() {
    return { tokens: fs.readdirSync(resultsDir()).filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, '')) }
}
export function deleteToolResult(token) {
    const f = path.join(resultsDir(), token + '.txt')
    if (fs.existsSync(f)) fs.unlinkSync(f)
    return { deleted: token }
}

// --- pipeline entry points -------------------------------------------------
// Optional pre-call helper: sanitize a tool's schema, then shape args against
// it (drop anything not declared in schema.parameters.properties, fill
// declared defaults). NOT wired into dispatchTool's hot path automatically —
// shapeArgs' drop-undeclared-keys behavior is too easy to silently break a
// tool whose schema.parameters.properties is incomplete relative to what its
// handler actually reads. Schema sanitization IS wired, but at the schema
// exposure boundary instead (src/toolsets.js getEnabledToolSchemas), which is
// where the previous schema_sanitizer tool's stripped-eval/exec/__proto__
// guarantee actually matters (what the LLM sees), not at args-application
// time. Exported for callers that want the args-shaping behavior explicitly.
export function applyPreCall(tool, args) {
    const schema = sanitizeSchema(tool.schema)
    return shapeArgs(schema?.parameters, args)
}

// Post-call: strip ANSI, then enforce the output-length cap; if the result
// still exceeds the cap after truncation would lose data, persist the full
// text to disk first and note the retrieval token in the truncated output.
export function applyPostCall(text) {
    let out = stripAnsi(text)
    const limit = getConfigValue('tool.output_limit', 100_000)
    if (out.length > limit) {
        const { token } = storeToolResult(out)
        out = truncate(out, limit) + `\n…[full output stored: tool_result token=${token}]`
    }
    return out
}

// Composable pipeline runner: { toolCall: {name, tool, args}, result: string }
// -> transformed result string. This is the single call site host_helpers.js
// wires in after a tool's handler resolves and before dispatchTool returns.
export function applyToolMiddleware(toolCall, result) {
    return applyPostCall(result)
}
