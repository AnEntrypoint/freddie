import {
    log,
    ACPTOAPI_TIMEOUT_MS,
    getAcptoapiUrl,
    getAcptoapiModel,
    getAcptoapi,
    resolveChainLinks,
    isReachable,
} from './acptoapi_config.js'
import {
    adaptMessage,
    adaptTool,
    adaptResponse,
    forcedToolChoiceMissed,
    isLikelyToolRefusal,
} from './acptoapi_format.js'

export { getAcptoapiUrl, getAcptoapiModel, isReachable }

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
