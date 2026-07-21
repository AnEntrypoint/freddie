import { logger } from '../observability/log.js'
import { parseTextToolCalls } from './tool_call_text.js'

const log = logger('acptoapi')

// Browser-safe env read: this module evaluates in a plain browser context where
// `process` is undefined (no node shim yet), so a bare process.env throws
// "process is not defined" and aborts the whole bundle import. envVal() reads
// live (picks up a late-installed shim) and never throws.
const envVal = (k) => { try { return (typeof process !== 'undefined' && process.env) ? process.env[k] : undefined } catch { return undefined } }
const ACPTOAPI_TIMEOUT_MS = Number(envVal('FREDDIE_LLM_TIMEOUT_MS')) || 240000

export function getAcptoapiUrl() {
    // Returns the configured dialable acptoapi URL, or null when unset. Most
    // callers (the dashboard health row, CLI banner) treat this as display/logging
    // only -- there is no listening port required for the in-process callLLM()
    // path below. However codex_responses_adapter.js, gemini_native_adapter.js,
    // src/imagegen/provider.js, and models/discovery.js still fetch() this value as a
    // live HTTP base and DO require a real dialable URL (FREDDIE_LLM_URL set) --
    // they must guard against a null return rather than building a request
    // against a placeholder string.
    return envVal('FREDDIE_LLM_URL') || null
}

export function getAcptoapiModel() {
    return envVal('FREDDIE_LLM_MODEL') || 'claude/haiku'
}

let _acptoapi = null
async function getAcptoapi() {
    if (!_acptoapi) {
        const mod = await import('acptoapi')
        // acptoapi is a CJS package; Node's CJS-to-ESM interop only statically
        // detects a SUBSET of module.exports keys as named exports (witnessed:
        // `chat` is a real named export, `listAllModelsAndQueues` is not, even
        // though both are plain keys on the same module.exports object) -- read
        // through `.default` (the full CJS exports object) so every export is
        // reachable regardless of which subset the interop happened to pick up.
        _acptoapi = mod.default && typeof mod.default === 'object' ? mod.default : mod
    }
    return _acptoapi
}

// A single 'provider/model' string (the common shape of FREDDIE_LLM_MODEL / a
// per-call `model` override) is resolved by acptoapi's plain chat() via
// resolveModel() to exactly ONE provider -- no fallback chain applies unless
// the caller already used comma-list / queue/ / chain/ syntax. A configured
// model whose provider is unreachable (wrong/unrecognised proxy name, expired
// key, provider outage) then hard-fails every call with no safety net, even
// though acptoapi ships a real auto-chain fallback engine
// (buildAutoChain/chatChain) for exactly this case. isConfiguredChainSyntax
// recognizes the syntaxes that ALREADY encode their own explicit chain, so
// resolveChainLinks only builds an auto-chain around a bare single-model
// string -- an operator who deliberately wrote 'a,b,c' or 'queue/foo' keeps
// exclusive control of that chain, unchanged.
function isConfiguredChainSyntax(model) {
    if (typeof model !== 'string') return false
    return model.includes(',') || model.startsWith('queue/') || model.startsWith('chain/') || model === 'auto'
}

// Builds the real fallback chain for a bare single-model request: the
// requested model first, then every other configured/available provider
// behind it (acptoapi's own buildAutoChain -- see its AGENTS.md "Auto-Fallback
// Chain" section). If chain construction itself throws (unexpected acptoapi
// shape change), degrade to the single requested model rather than blocking
// the call entirely -- this function must never be the reason a call that
// could otherwise succeed never gets attempted.
async function resolveChainLinks(acptoapi, useModel) {
    if (isConfiguredChainSyntax(useModel)) return useModel
    try {
        const links = acptoapi.buildAutoChain(useModel)
        return (Array.isArray(links) && links.length) ? links.map(l => l.model || l) : useModel
    } catch { return useModel }
}

// In-process call: acptoapi's own chat()/chatChain() walks its provider/model
// resolution (including a comma-list or named chain for multi-model fallback)
// with no HTTP hop and no separate listening process -- eliminates the
// standalone acptoapi.js daemon on :4800 entirely, along with its witnessed
// failure mode (an uncaught ACP-timeout exception crashing the whole bridge
// process). A bare single-model request is expanded into the real auto-chain
// (see resolveChainLinks above) so an unreachable configured provider falls
// through to another live one instead of failing every turn outright.
export async function callLLM({ messages, tools = [], model, tool_choice, cwd = null } = {}) {
    const acptoapi = await getAcptoapi()
    const useModel = model || getAcptoapiModel()
    const chainModel = await resolveChainLinks(acptoapi, useModel)
    const hasTools = Array.isArray(tools) && tools.length > 0
    const adaptedMessages = messages.map(adaptMessage)
    // The coder-agent working-directory note is OPT-IN via an explicit `cwd` param.
    // It used to be injected on every tool-bearing call, which polluted NON-coder
    // agents' prompts with "use your built-in tools (Bash, Read, Write)" -- tool
    // hallucination bait plus a filesystem-path leak for hosts (like a contact-facing
    // chat agent) whose toolset has no such tools. runTurn already composes its own
    // cwd note when a caller passes cwd; direct callLLM users opt in the same way.
    if (hasTools && cwd) {
        const sysIdx = adaptedMessages.findIndex(m => m.role === 'system')
        const cwdNote = `\nWorking directory: ${cwd}\nUse your built-in tools (Bash, Read, Write) to explore files in this directory when needed.`
        if (sysIdx >= 0) adaptedMessages[sysIdx] = { ...adaptedMessages[sysIdx], content: (adaptedMessages[sysIdx].content || '') + cwdNote }
        else adaptedMessages.unshift({ role: 'system', content: cwdNote.trim() })
    }
    // acptoapi's chat() is a plain Promise with no AbortSignal support (each
    // underlying provider has its own internal per-call timeout, e.g. the
    // openai-compat provider's OPENAI_COMPAT_TIMEOUT_MS, default 180s) -- so the
    // overall deadline here is enforced by racing a timeout, not by aborting the
    // in-flight call itself.
    let _timeoutHandle
    const _timeout = new Promise((_, reject) => {
        _timeoutHandle = setTimeout(() => reject(new Error('acptoapi call timeout')), ACPTOAPI_TIMEOUT_MS)
    })
    const chatOpts = {
        messages: adaptedMessages,
        ...(hasTools ? { tools: tools.map(adaptTool) } : {}),
        // Forward tool_choice through to the underlying provider. acptoapi's
        // buildParams() spreads unrecognized opts keys straight into the
        // outbound request body (confirmed: lib/sdk.js buildParams's `...clean`
        // reaches providers/openai.js's `body` unfiltered) -- the prior gap was
        // never acptoapi itself dropping this, it was THIS call site never
        // including the key at all. Only meaningful alongside tools.
        ...(hasTools && tool_choice ? { tool_choice } : {}),
        max_tokens: 4096,
    }
    // An array chainModel (built by resolveChainLinks above) dispatches via
    // chatChain -- the requested model tried first, falling through to the
    // rest of the real provider chain on failure/timeout/rate-limit; a plain
    // string (explicit chain syntax, or the auto-chain build itself failed)
    // dispatches via the original single-model chat() unchanged.
    let json
    try {
        json = await Promise.race([
            Array.isArray(chainModel)
                ? acptoapi.chatChain(chainModel, chatOpts)
                : acptoapi.chat({ model: chainModel, ...chatOpts }),
            _timeout,
        ])
    } finally { clearTimeout(_timeoutHandle) }
    // The model that actually SERVED this turn -- chatChain's own attempt
    // history (chain-machine.js's `attempted` array) is the only reliable
    // source: not every underlying provider echoes the requested model id
    // back in its response body, so json.model alone is not trustworthy.
    // The last successful attempt is the served one.
    const servedModel = Array.isArray(chainModel)
        ? (Array.isArray(json.__chainAttempted) ? json.__chainAttempted.filter(a => a.ok).slice(-1)[0]?.model : null) || json.model || null
        : useModel
    log.info('completed', { model: useModel, servedModel, usage: json.usage })
    const adapted = adaptResponse(json)
    adapted.model = servedModel
    // tool_choice is now genuinely forwarded to the provider (see chatOpts
    // above) -- but a provider can still ignore it (not every backend actually
    // enforces the OpenAI tool_choice contract, and the openai-compat request
    // body shape varies by upstream). A missed tool call is NOT automatically
    // bad: the model can still answer in real, useful prose without touching a
    // tool (the caller decides whether that content is good enough to send --
    // see casey's hooks/handler.js isToolRefusal for its own content-based
    // judgment). What IS unambiguously bad, and what this penalizes, is a
    // missed tool call that ALSO returned nothing usable: empty content, or a
    // self-referential refusal about the model's own tool access. That
    // combination structurally cannot be a real answer.
    //
    // Why penalize at all: a model that reliably returns FAST, ERROR-FREE
    // responses while simply ignoring tool_choice looks perfectly healthy to
    // acptoapi's own availability ranker (lib/availability.js), which only
    // tracks network/latency success -- it has no concept of tool-call
    // compliance. Live-witnessed: sambanova/gemma-4-31B-it won the "best
    // available model" slot on EVERY retry of a forced-tool-call turn (3/3
    // attempts, each a fresh chain build) purely because it kept succeeding
    // fast (1.8-3.9s, zero errors) -- casey's own retry-on-miss logic assumed
    // a fresh chain build would naturally diversify the model choice, but it
    // never could: the broken model kept re-winning the ranking every single
    // time. Penalizing the served model directly in the SAME shared
    // availability tracker the ranker reads means the NEXT chain build
    // (including this turn's own next retry) actually routes around it.
    if (forcedToolChoiceMissed(tool_choice, hasTools, adapted) && servedModel) {
        const uselessMiss = !adapted.content || isLikelyToolRefusal(adapted.content)
        log.warn('tool_choice required but no tool call returned', { model: servedModel, uselessMiss, hadContent: !!adapted.content })
        if (uselessMiss) {
            try {
                const mod = await getAcptoapi()
                if (mod && typeof mod.recordModelFailure === 'function') mod.recordModelFailure(servedModel)
            } catch { /* best-effort -- never break the real response over a scoring side-effect */ }
        }
    }
    return adapted
}

function forcedToolChoiceMissed(tool_choice, hasTools, adapted) {
    const forced = tool_choice === 'required' || tool_choice?.type === 'required'
    return forced && hasTools && !adapted.tool_calls.length
}

// Mirrors casey's own hooks/heuristics.js isToolRefusal so the SAME class of
// content ("I don't have the tools/access to assist") is recognized at this
// layer too, for the availability-penalty decision -- kept independent
// (freddie must not import casey's app-specific heuristics module) but
// intentionally the same marker shape.
const TOOL_REFUSAL_MARKERS = [
    "don't have the tools",
    'do not have the tools',
    "don't have access to",
    'do not have access to',
    'unable to access the',
    'i cannot call',
    "i can't call",
    'no tool available',
    'lack the necessary tools',
]
function isLikelyToolRefusal(text) {
    if (!text) return false
    const norm = String(text).toLowerCase().replace(/\s+/g, ' ').trim()
    return TOOL_REFUSAL_MARKERS.some(m => norm.includes(m))
}

function adaptMessage(m) {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        return {
            role: 'assistant',
            content: m.content || '',
            tool_calls: m.tool_calls.map(tc => ({
                id: tc.id || tc.tool_call_id,
                type: 'function',
                function: { name: tc.name || tc.function?.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {}) },
            })),
        }
    }
    return { role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
}

function adaptTool(t) {
    return {
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters || t.input_schema || { type: 'object', properties: {} },
        },
    }
}

function adaptResponse(r) {
    const choice = r.choices?.[0]?.message || {}
    const content = typeof choice.content === 'string' ? choice.content : ''
    const tool_calls = Array.isArray(choice.tool_calls)
        ? choice.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryParseJson(tc.function?.arguments) }))
        : []
    // Recover text-format tool calls (kimi <|tool_call_begin|> / llama
    // <|python_tag|> / a bare JSON array of {name,parameters}) from weak
    // models that don't emit structured tool_calls -- see tool_call_text.js
    // for the full format list and why a bare-array match is deliberately
    // narrow (whole-content only, never JSON quoted inside real prose).
    if (!tool_calls.length) {
        const textTC = parseTextToolCalls(content)
        if (textTC.length) return { content: '', tool_calls: textTC, raw: r }
    }
    return { content, tool_calls, raw: r }
}

function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

// In-process reachability: acptoapi is a library import now, not a port to
// dial, so there is no cheap side-channel that answers "is SOME model
// reachable" for an arbitrary provider (witnessed: listAllModelsAndQueues only
// enumerates configured matrix/queue sources, empty by default; the sampler
// cache starts empty until something actually probes/fails a provider). The
// only generically correct answer is a real minimal call: send a trivial
// message with a short timeout and treat success as reachable. Probing
// THROUGH the same auto-chain callLLM now dispatches (see resolveChainLinks)
// rather than the bare configured model alone -- a reachability probe that
// only checked the configured model (e.g. an unreachable/misconfigured single
// proxy like a stale 'chatjimmy/...' entry) previously reported the whole
// backend down even when other configured/available providers were live and
// callLLM's own chain would have succeeded; that mismatch is exactly what
// left `resolveCallLLM`'s health check permanently red while a real reply
// path existed.
// SEVERE, live-witnessed bug in the old 10000ms default: a real chain walk
// (chatChain falling through multiple candidates on rate_limit/timeout/auth)
// routinely takes 15-30+ seconds under real-world provider contention --
// live-witnessed casey turns completing successfully in that range all
// session. A 10s race against that reality meant isReachable() frequently
// timed out and returned false EVEN THOUGH the same chain, given a few more
// seconds, would have (and immediately after DID, via a completely separate
// call moments later) succeeded. The caller (casey's llm.js
// makeResilientCallLLM) then DEBOUNCES re-resolution for a further 30s on
// this single false negative, locking the whole process into "LLM backend
// down; queued inbound, no reply sent" for real users while the actual
// provider chain was fully reachable underneath. 45s still bounds a genuine
// full outage from hanging forever, but comfortably covers the walk time a
// real, working (not down) chain needs under real contention.
// PROBE_CHAIN_LINK_CAP bounds how many candidates a reachability probe itself
// walks. isReachable races its chatChain call against timeoutMs, but no
// provider adapter honors an external AbortSignal (each hardcodes its own
// internal AbortSignal.timeout for its own fetch) -- live-witnessed: when the
// timeout side of the race wins (or the caller simply stops awaiting because a
// separate real callLLM invocation completes first), the losing chatChain
// promise is NOT cancelled and keeps walking the REST of the full ~13-link
// auto-chain in the background, each hop still a real network call against a
// real provider, its result silently discarded. Every resolveCallLLM/ensure()
// cycle (casey's makeResilientCallLLM debounces this to as little as a few
// seconds while degraded) could therefore leave an orphaned probe walk
// consuming real rate-limit budget indefinitely, compounding the exact
// capacity exhaustion this reachability check exists to detect. True
// cancellation would require threading a caller AbortSignal through every
// provider adapter's fetch call (merged with each one's own internal timeout
// signal) -- a larger cross-cutting change. Capping the probe to the first
// few links instead bounds the abandoned-walk blast radius to a handful of
// hops (which finish or fail fast) rather than the full chain, while still
// answering the real question ("is something near the top of the chain
// reachable") the probe needs.
const PROBE_CHAIN_LINK_CAP = 3

export async function isReachable(timeoutMs = 45000) {
    try {
        const acptoapi = await getAcptoapi()
        const useModel = getAcptoapiModel()
        const chainModel = await resolveChainLinks(acptoapi, useModel)
        const probeChain = Array.isArray(chainModel) ? chainModel.slice(0, PROBE_CHAIN_LINK_CAP) : chainModel
        const probe = { messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }
        const result = await Promise.race([
            Array.isArray(probeChain) ? acptoapi.chatChain(probeChain, probe) : acptoapi.chat({ model: probeChain, ...probe }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('reachability probe timeout')), timeoutMs)),
        ])
        return !!(result && result.choices && result.choices.length)
    } catch { return false }
}
