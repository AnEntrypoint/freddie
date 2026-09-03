// delegate tool — spawn a single focused subagent for a task.
//
// Routes through lib/runner.js's runSubagent, the shared subagent runner
// agent_swarm already uses (plugins/agent_swarm/handler.js) -- this tool
// used to call src/agent/machine.js's runTurn directly with a hardcoded
// timeoutMs:60000, a stale, undocumented ceiling never updated after
// runner.js was extracted from this exact file specifically to let both
// tools share the turn-loop logic (see runner.js's own header comment).
// Live-reported symptom this caused: real subagent calls (each iteration a
// full LLM round-trip, itself subject to llm_resolver.js's own retry
// budget -- 15 minutes worst case as of this session, was 60s) timed out
// after too few iterations, since a single slow/retried LLM call alone
// could consume the delegate turn's whole ceiling before any real work
// happened. subagent-helpers.js's DEFAULT_TIMEOUT_S=1800s carries real
// headroom above that one-call worst case, and timeout_s: 0 is UNBOUNDED
// (matching the top-level TUI turn's own no-timer convention for genuine
// long-horizon work, per direct user instruction) -- there is no longer a
// hard maximum a caller can be stuck under.
//
// run_in_background and resume were already fully implemented in
// runner.js (fire-and-forget dispatch + persisted-state continuation) but
// never reached this tool's own schema, so the orchestrator LLM had no
// way to actually request either -- it could only run a subagent
// synchronously to completion or failure, with no way to check on one
// later or pick a stalled/finished one back up. Both are now real
// schema-visible parameters. The companion subagent_status tool
// (plugins/core/subagent_status/handler.js) is the read-only polling half
// of this workflow: spawn here with run_in_background:true, get an
// agent_id back immediately, poll subagent_status action:'get' with that
// agent_id until status is no longer 'running', then call delegate again
// with resume:<agent_id> to continue that same subagent's conversation
// (give it new direction, ask it to keep going, etc.) -- resume is for
// CONTINUING, subagent_status is for CHECKING, they are not
// interchangeable.
import { runSubagent } from './lib/runner.js'

export const _tool = ({
    name: 'delegate',
    toolset: 'core',
    schema: {
        name: 'delegate',
        description: "Spawn a sub-agent to handle a focused task. By default runs synchronously and returns the sub-agent's final result. Set run_in_background:true to instead get an agent_id back immediately while the subagent keeps working -- poll it with the subagent_status tool (action:'get', that agent_id) to see when it's done and read its result, then call delegate again with resume:<agent_id> to continue that subagent's work with new instructions.",
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string' },
                model: { type: 'string' },
                max_iterations: { type: 'number', default: 30 },
                timeout_s: { type: 'number', default: 1800, description: 'Wall-clock budget for the whole subagent turn, in seconds (30+, or 0 for UNBOUNDED long-horizon work). Must comfortably exceed a single LLM call’s own worst-case retry time (up to 15 minutes on a rate-limited model) times the number of iterations the task realistically needs.' },
                run_in_background: { type: 'boolean', default: false, description: "If true, returns immediately with {background:true, agent_id, task_id} instead of waiting for the subagent to finish. Check on it later via the subagent_status tool, then resume it here when ready to continue." },
                resume: { type: 'string', description: "An agent_id from a PRIOR delegate call (background or not) to continue that subagent's conversation instead of starting a fresh one -- use this after checking subagent_status shows it's done (or you want to redirect a still-running one with new instructions)." },
            },
            required: ['task'],
        },
    },
    handler: async ({ task, model, max_iterations = 30, timeout_s, run_in_background, resume }, ctx = {}) => {
        const out = await runSubagent({ task, model, max_iterations, timeout_s, run_in_background, resume, ctx })
        return { result: out.result, error: out.error, iterations: out.iterations, depth: out.depth, agent_id: out.agent_id, timed_out: out.timed_out, background: out.background, task_id: out.task_id }
    },
})
