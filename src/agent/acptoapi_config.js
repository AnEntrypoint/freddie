import { logger } from '../observability/log.js'

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

// No hardcoded model guess here: this module is deliberately Node/browser
// agnostic (no config.js import -- that pulls in node:fs) and previously
// defaulted to the literal 'claude/haiku' when FREDDIE_LLM_MODEL was unset.
// On a machine with no anthropic key and no acptoapi daemon (a purely
// local-model setup via extra-providers.txt), that hardcoded guess is
// unreachable every single call -- isReachable()/callLLM() then wasted a
// full chain-probe cycle on a model nothing ever configured, before any
// real (e.g. extra-provider) model got a turn. defaultModel lets a Node
// caller (llm_provider_warmup.js) inject the SAME first entry it already
// resolves from agent.model_preference, so this module has zero opinion of
// its own about which model to guess.
export function getAcptoapiModel(defaultModel = null) {
    return envVal('FREDDIE_LLM_MODEL') || defaultModel || null
}

let _acptoapi = null
export async function getAcptoapi() {
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
//
// 'auto' is DELIBERATELY EXCLUDED from this list, even though it looks like
// "already configured chain syntax" at a glance -- it is the opposite: a
// sentinel that MUST be expanded via acptoapi.buildAutoChain('auto') to
// become real links, not a self-contained chain spec like the other three.
// Live-witnessed bug (fixed here): with 'auto' included, resolveChainLinks
// returned the bare string 'auto' unexpanded, and isReachable()/callLLM's own
// !Array.isArray(chainModel) branch then called acptoapi.chat({model:'auto',
// ...}) directly -- the literal string 'auto' is not a real model id in that
// non-chain code path and the call hangs indefinitely (60s+, no error, no
// resolution) rather than failing fast. isReachable()'s own 45s timeout was
// the only thing ever resolving it, so every reachability check with
// FREDDIE_LLM_MODEL='auto' silently reported unreachable/false regardless of
// how healthy the real provider ecosystem actually was.
export function isConfiguredChainSyntax(model) {
    if (typeof model !== 'string') return false
    return model.includes(',') || model.startsWith('queue/') || model.startsWith('chain/')
}

// Builds the real fallback chain for a bare single-model request: the
// requested model first, then every other configured/available provider
// behind it (acptoapi's own buildAutoChain -- see its AGENTS.md "Auto-Fallback
// Chain" section). If chain construction itself throws (unexpected acptoapi
// shape change), degrade to the single requested model rather than blocking
// the call entirely -- this function must never be the reason a call that
// could otherwise succeed never gets attempted.
export async function resolveChainLinks(acptoapi, useModel) {
    if (isConfiguredChainSyntax(useModel)) return useModel
    try {
        const links = acptoapi.buildAutoChain(useModel)
        return (Array.isArray(links) && links.length) ? links.map(l => l.model || l) : useModel
    } catch { return useModel }
}

// Hardcoded 45000 previously, with no override -- real config conflict
// live-witnessed: a caller that raises ACPTOAPI_CHAIN_LINK_TIMEOUT_MS above
// 45000 (a genuine, deliberate setting for slow-but-working reasoning
// models, e.g. casey's own .env raises it to 60000) gets a reachability
// probe that ALWAYS times out on any chain containing even one slow link,
// because the outer 45s budget fires before that link's own legitimate
// per-link timeout completes -- even though the SAME chain walk succeeds
// fine under callLLM's real, larger outer deadline. Now reads
// ACPTOAPI_REACHABILITY_PROBE_TIMEOUT_MS when set (falls back to the same
// 45000 default otherwise, fully backward compatible), so a deployment that
// tunes its chain-link timeout can keep the reachability probe's own budget
// in sync rather than silently under-provisioned relative to it.
export const REACHABILITY_PROBE_TIMEOUT_MS = Number(envVal('ACPTOAPI_REACHABILITY_PROBE_TIMEOUT_MS')) || 45000
export const REACHABILITY_PROBE_CHAIN_LINK_CAP = 3

// model: optional override, matching callLLM's own req.model precedence
// (getAcptoapiModel() default when omitted). Without this, a caller whose
// actual model choice differs from FREDDIE_LLM_MODEL/'claude/haiku' (e.g.
// casey's CASEY_LLM_MODEL, passed to callLLM per-call but NEVER threaded
// through the separate reachability check) always probed the WRONG model --
// live-witnessed: CASEY_LLM_MODEL=auto real turns worked once isReachable
// was told to probe 'auto' too instead of silently falling back to
// freddie's own unrelated default and reporting the ecosystem unreachable
// even when the model the caller actually cares about is fully healthy.
export async function isReachable(timeoutMs = REACHABILITY_PROBE_TIMEOUT_MS, model = null) {
    try {
        const acptoapi = await getAcptoapi()
        const useModel = model || getAcptoapiModel()
        // No configured/injected model at all (no FREDDIE_LLM_MODEL, no
        // per-call override, no defaultModel ever threaded in): there is
        // nothing to probe. Report unreachable without spending a real
        // chain-probe cycle guessing at a model nobody configured.
        if (!useModel) return false
        const chainModel = await resolveChainLinks(acptoapi, useModel)
        const probeChain = Array.isArray(chainModel) ? chainModel.slice(0, REACHABILITY_PROBE_CHAIN_LINK_CAP) : chainModel
        // max_tokens: 4 previously -- too tight for a reasoning model that
        // always opens with a <think> preamble (witnessed: MiniCPM5-1B's
        // 4-token probe response was literally "<think>\nOkay," with zero
        // real content, which isEmptyResult()/the choices-length check below
        // then read as "unreachable" even though the SAME model served a
        // correct, fast, real response seconds later at a normal token
        // budget). 32 tokens is enough for a short <think> preamble to
        // resolve into at least the start of real content on any model,
        // reasoning or not, while staying cheap for a health probe.
        const probe = { messages: [{ role: 'user', content: 'ping' }], max_tokens: 32 }
        const result = await Promise.race([
            Array.isArray(probeChain) ? acptoapi.chatChain(probeChain, probe) : acptoapi.chat({ model: probeChain, ...probe }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('reachability probe timeout')), timeoutMs)),
        ])
        return !!(result && result.choices && result.choices.length)
    } catch { return false }
}

export { log, envVal, ACPTOAPI_TIMEOUT_MS }
