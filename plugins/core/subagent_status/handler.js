// subagent_status — read-only poll surface over plugins/core/delegate's own
// subagent store (store.js's listSubagents/loadSubagent), so the
// orchestrator can check on a subagent it spawned with delegate's
// run_in_background:true without resuming/continuing it (delegate's own
// resume param is for CONTINUING a subagent's conversation, a different
// operation than just reading its current state). Never writes -- no
// action here creates, mutates, or removes a subagent record; that stays
// exclusively delegate/runner.js's responsibility (persistSubagent), so
// there is exactly one writer for this store, matching this codebase's own
// single-writer-per-surface discipline.
//
// A background subagent is visible in the store the instant it's spawned
// (runner.js's persistSubagent({status:'running', ...}) call happens
// BEFORE the background turn is dispatched, not after) -- there is no
// "not yet visible" gap to design around: list/get always reflect the
// real current record, 'running' included.
//
// Session-scoped: store.js's subagents.jsonl is a single file under
// FREDDIE_HOME (project-scoped per AGENTS.md, but NOT per-session), so
// with no filtering here a caller in one session could read every OTHER
// session's subagent task/result text -- adversarial review of this exact
// tool found that gap live. Every record now carries owner_session_key
// (runner.js, set once at spawn, preserved across resume), and both
// actions here filter to records whose owner_session_key matches the
// CALLING session (ctx.sessionKey) OR has no owner at all (null -- a
// detached batch/cron-spawned subagent with no session to scope to,
// treated as visible to any caller since there is no narrower scope to
// enforce). A record owned by a DIFFERENT session is invisible to list
// and get alike -- get returns the same "not found" shape a genuinely
// nonexistent agent_id would, so this filter cannot be used to probe
// which agent_ids exist in other sessions either.
import { listSubagents, loadSubagent } from '../delegate/store.js'

function visibleTo(s, sessionKey) {
    return s.owner_session_key == null || s.owner_session_key === sessionKey
}

const ACTIONS = {
    list: async (_args, ctx) => {
        const items = (await listSubagents()).filter((s) => visibleTo(s, ctx.sessionKey))
        // Same field set the workflow actually needs to decide what to do
        // next (poll again vs. resume vs. done) -- omits messages_preview
        // and the full result/error text (get returns those) so a listing
        // of many subagents stays compact instead of dumping every
        // subagent's full transcript preview into one response.
        return {
            subagents: items.map((s) => ({
                agent_id: s.agent_id,
                subagent_type: s.subagent_type,
                status: s.status,
                description: s.description,
                created_at: s.created_at,
                completed_at: s.completed_at,
                depth: s.depth,
                timed_out: s.timed_out,
            })),
        }
    },
    get: async ({ agent_id }, ctx) => {
        if (!agent_id) return { error: 'agent_id required' }
        const s = await loadSubagent(agent_id)
        if (!s || !visibleTo(s, ctx.sessionKey)) return { error: `no subagent found for agent_id: ${agent_id}` }
        return {
            agent_id: s.agent_id,
            subagent_type: s.subagent_type,
            status: s.status,
            description: s.description,
            task: s.task,
            model: s.model,
            created_at: s.created_at,
            completed_at: s.completed_at,
            depth: s.depth,
            iterations: s.iterations,
            result: s.result,
            error: s.error,
            timed_out: s.timed_out,
        }
    },
}

export const _tool = ({
    name: 'subagent_status',
    toolset: 'core',
    schema: {
        name: 'subagent_status',
        description: "Check on subagents spawned via delegate's run_in_background:true, without resuming them (scoped to subagents YOU spawned in this session). action:'list' returns every tracked subagent's status (running/completed/error/timed_out) + description, for deciding what to check next. action:'get' with agent_id returns one subagent's full record, including its result/error once status is no longer 'running'. Read-only -- to actually continue a subagent's work once you've seen it's done (or want to give it more direction), call delegate again with resume:<agent_id>, not this tool.",
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: Object.keys(ACTIONS) },
                agent_id: { type: 'string', description: "Required for action:'get'; the agent_id delegate returned when the subagent was spawned." },
            },
            required: ['action'],
        },
    },
    handler: async (args, ctx = {}) => { const fn = ACTIONS[args.action]; return fn ? fn(args, ctx) : { error: 'unknown action' } },
})
