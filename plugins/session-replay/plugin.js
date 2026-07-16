// `freddie session replay <id>` — reconstructs a conversation from the real
// session store, and if a matching trajectory file exists under
// <FREDDIE_HOME>/trajectories/ (src/agent/machine.js's writeTrajectory,
// schema_version 2), replays tool_calls/tool_results/state_transitions in
// order with timing, for post-mortem debugging.
import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../src/home.js'
import { listSessions, getSession, getMessages } from '../../src/sessions.js'

function findTrajectoryFor(sessionId, prompt) {
    const dir = path.join(getFreddieHome(), 'trajectories')
    if (!fs.existsSync(dir)) return null
    // Trajectories are keyed by timestamp+prompt-slug, not session id (that
    // linkage doesn't exist in the recorder yet) -- best-effort match against
    // the session's own first-prompt slug, most recent first.
    const slug = (prompt || '').slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
    if (!slug) return null
    const candidates = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.includes(slug)).sort()
    if (!candidates.length) return null
    try { return JSON.parse(fs.readFileSync(path.join(dir, candidates[candidates.length - 1]), 'utf8')) }
    catch { return null }
}

function replayTrajectory(traj) {
    if (traj.schema_version !== 2) { console.log(`  (trajectory schema_version ${traj.schema_version} unsupported, skipping replay detail)`); return }
    console.log(`\n--- trajectory replay: ${traj.iterations} iteration(s), provider=${traj.provider} model=${traj.model} ---`)
    for (const t of traj.state_transitions) console.log(`  [state] ${t}`)
    for (const call of traj.llm_calls || []) console.log(`  [llm] provider=${call.provider} model=${call.model} ok=${call.ok} ${call.durationMs}ms`)
    for (const tc of traj.tool_calls || []) console.log(`  [tool_call] ${tc.name}(${JSON.stringify(tc.arguments)})`)
    for (const tr of traj.tool_results || []) console.log(`  [tool_result] ${tr.tool_call_id}: ${String(tr.content).slice(0, 200)}`)
    if (traj.error) console.log(`  [error] ${traj.error}`)
}

export default {
    name: 'session-replay', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'session-replay',
            description: 'Reconstruct a conversation and (if available) replay its recorded trajectory (session-replay <id>)',
            args: [{ name: 'id' }],
            action: async (id) => {
                if (!id) { console.log('usage: freddie session-replay <id>'); process.exitCode = 1; return }
                const rows = await listSessions(500)
                const target = rows.find((s) => s.id === id || s.id.startsWith(id))
                if (!target) { console.log(`no session matching: ${id}`); process.exitCode = 1; return }
                const s = await getSession(target.id)
                const messages = await getMessages(target.id)
                console.log(`# ${s.title || '(untitled)'}  [${s.id.slice(0, 8)}]  ${s.model || ''}  ${new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' ')}`)
                for (const m of messages) console.log(`\n${m.role}: ${m.content || (m.tool_calls ? '[tool call]' : '')}`)
                const firstUserPrompt = messages.find((m) => m.role === 'user')?.content
                const traj = findTrajectoryFor(target.id, firstUserPrompt)
                if (traj) replayTrajectory(traj)
                else console.log('\n(no matching trajectory found -- run with agent.save_trajectories=true or --witness to record one)')
            },
        })
    },
}
