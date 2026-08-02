// Wire-protocol -> ACP session/update bridge.
//
// Translates freddie's canonical turn-event envelopes (src/agent/events.js)
// into Agent Client Protocol frames so Zed/JetBrains-class ACP clients see a
// live turn stream as `session/update` notifications, with tool approvals
// surfaced as server->client `session/request_permission` requests whose
// outcome is fed back into the running turn via resolveApproval.
//
// One bridge instance per in-flight turn, constructed by the ACP server's
// `session/prompt` handler with two callbacks:
//   sendUpdate(update)         — emits {method:'session/update', params:{sessionId, update}}
//   requestPermission(params)  — server->client request, resolves the client's response
//
// Event mapping (wire event -> ACP):
//   assistant.delta            -> agent_message_chunk (text)
//   message.append (assistant) -> agent_message_chunk, but ONLY when no deltas
//                                 streamed for this message (the llm_resolver
//                                 path is non-streaming today; when a streaming
//                                 path emits deltas the full-content append
//                                 would double-render)
//   message.append (user)      -> skipped — the client originated that text in
//                                 its own session/prompt; echoing double-renders
//   steer.append               -> user_message_chunk
//   tool.start                 -> tool_call (status in_progress, rawInput=args)
//   tool.end                   -> tool_call_update (completed; failed on
//                                 denied|budgetExceeded)
//   approval.request           -> session/request_permission -> resolveApproval
//   approval.resolved          -> no ACP frame (outcome rides the tool_call_update)
//   session.end/session.error  -> no ACP frame (result rides the prompt response)
//   queue.append               -> no ACP frame (ACP has no queue concept; the
//                                 prompt handler drains queued follow-ups)

import { onTurnEvent } from '../agent/events.js'
import { resolveApproval } from '../agent/live-turns.js'

// ACP ToolKind heuristic from freddie tool names. Drives the client's icon/UI
// treatment only — a miss degrades to 'other', never breaks the frame.
const TOOL_KIND_MAP = [
    [/^(read|read_file|view|cat)$/, 'read'],
    [/^(write|edit|file_operations|apply_patch)$/, 'edit'],
    [/^(delete|rm|remove)$/, 'delete'],
    [/^(move|rename|mv)$/, 'move'],
    [/^(grep|glob|search|find|web_search)$/, 'search'],
    [/^(bash|terminal|code_execution|process_registry|exec_js|cronjob)$/, 'execute'],
    [/^(fetch|browse|web_fetch|browser)$/, 'fetch'],
    [/^(think|thinking)$/, 'think'],
]

function toolKind(name) {
    for (const [re, kind] of TOOL_KIND_MAP) if (re.test(name)) return kind
    return 'other'
}

// Human-readable title: tool name plus the most identifying arg (command for
// bash, path for file tools, pattern for search) so the client renders
// "bash: ls -la" instead of a bare "bash".
function toolTitle(name, args) {
    const hint = args?.command ?? args?.path ?? args?.file_path ?? args?.pattern ?? args?.query ?? ''
    const s = typeof hint === 'string' && hint ? `${name}: ${hint}` : String(name)
    return s.length > 100 ? s.slice(0, 97) + '...' : s
}

// File location for follow-along clients, when the args carry a path.
function toolLocations(args) {
    const p = args?.path ?? args?.file_path
    if (typeof p !== 'string' || !p) return undefined
    return [{ path: p, line: typeof args?.line === 'number' ? args.line : null }]
}

function resultText(result) {
    if (result == null) return ''
    return typeof result === 'string' ? result : JSON.stringify(result)
}

export class AcpWireBridge {
    constructor({ sessionKey, sessionId, sendUpdate, requestPermission }) {
        this.sessionKey = sessionKey
        this.sessionId = sessionId
        this.sendUpdate = sendUpdate
        this.requestPermission = requestPermission
        // True once an assistant.delta has streamed for the current assistant
        // message; reset at each assistant message.append boundary.
        this.sawDelta = false
        this.unsub = onTurnEvent(sessionKey, (env) => this.onEvent(env))
    }

    dispose() { try { this.unsub?.() } catch { /* swallow: teardown is best-effort */ } }

    chunk(sessionUpdate, text) {
        this.sendUpdate({ sessionUpdate, content: { type: 'text', text: String(text) } })
    }

    onEvent(env) {
        try {
            const data = env?.data || {}
            switch (env?.event) {
                case 'assistant.delta':
                    if (data.text) { this.sawDelta = true; this.chunk('agent_message_chunk', data.text) }
                    break
                case 'message.append':
                    if (data.role === 'assistant') {
                        if (!this.sawDelta && data.content) this.chunk('agent_message_chunk', data.content)
                        this.sawDelta = false
                    }
                    break
                case 'steer.append':
                    if (data.text) this.chunk('user_message_chunk', data.text)
                    break
                case 'tool.start': this.onToolStart(data); break
                case 'tool.end': this.onToolEnd(data); break
                case 'approval.request': this.onApprovalRequest(data); break
                // approval.resolved / session.end / session.error / queue.append:
                // intentionally no ACP frame — see mapping table above.
            }
        } catch { /* swallow: a bridge error must never break the turn it observes */ }
    }

    onToolStart({ name, args, toolCallId }) {
        if (!toolCallId) return
        const locations = toolLocations(args)
        this.sendUpdate({
            sessionUpdate: 'tool_call',
            toolCallId: String(toolCallId),
            title: toolTitle(name, args),
            kind: toolKind(name),
            status: 'in_progress',
            rawInput: args ?? null,
            ...(locations ? { locations } : {}),
        })
    }

    onToolEnd({ toolCallId, result, denied, budgetExceeded }) {
        if (!toolCallId) return
        const failed = !!(denied || budgetExceeded)
        const text = denied ? 'Denied by user' : budgetExceeded ? 'Tool budget exceeded' : resultText(result)
        this.sendUpdate({
            sessionUpdate: 'tool_call_update',
            toolCallId: String(toolCallId),
            status: failed ? 'failed' : 'completed',
            ...(failed ? {} : { rawOutput: result ?? null }),
            ...(text ? { content: [{ type: 'content', content: { type: 'text', text } }] } : {}),
        })
    }

    // approval.request fires BEFORE tool.start (the gate precedes dispatch), so
    // no tool_call exists yet — the request carries a synthetic ToolCallUpdate
    // keyed by the approval id (the claude-code-acp pattern). The client's
    // decision maps back: allow-once/allow-always -> approved (+always),
    // reject/cancel/error -> denied with feedback the model sees as the tool
    // result.
    async onApprovalRequest({ id, name, args, cwd }) {
        let approved = false, always = false, feedback = null
        try {
            const res = await this.requestPermission({
                sessionId: this.sessionId,
                toolCall: {
                    toolCallId: String(id),
                    title: toolTitle(name, args),
                    kind: toolKind(name),
                    status: 'pending',
                    rawInput: args ?? null,
                    ...(cwd ? { locations: [{ path: cwd }] } : {}),
                },
                options: [
                    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
                    { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
                    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
                ],
            })
            if (res?.outcome?.outcome === 'selected') {
                const opt = res.outcome.optionId
                approved = opt === 'allow-once' || opt === 'allow-always'
                always = opt === 'allow-always'
                if (!approved) feedback = 'rejected by ACP client'
            } else {
                feedback = 'permission request cancelled by ACP client'
            }
        } catch (e) {
            feedback = 'permission request failed: ' + String(e?.message || e)
        }
        try { await resolveApproval(this.sessionKey, { id, approved, always, feedback }) } catch { /* swallow: late/duplicate resolution is harmless */ }
    }
}
