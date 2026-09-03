// research_contribute.js -- fan-out-to-shared-artifact primitive.
//
// batch.js and mixture_of_agents both run N INDEPENDENT prompts to N
// INDEPENDENT results (concatenated or returned as an array) -- neither
// produces a single shared artifact multiple agents contribute to over time.
// This module is the missing primitive: any number of agent turns, dispatched
// at any time (non-linear -- no fixed batch size known upfront, no required
// ordering between contributors), each appending one note into a SHARED
// folder identified by a runId. A later, separate step (consolidate.js) reads
// the accumulated folder back.
//
// Long-horizon: each contribution is wrapped in runStep(runId, stepId, fn) so
// a crash mid-contribution never double-writes or double-charges an LLM call
// on resume (see step-journal.js's at-most-once guarantee) -- but unlike
// batch.js there is no persistent xstate machine tracking "the batch," since
// there is no fixed batch: a caller may contribute to the same runId again
// hours or days later, and that is not a resumption of anything, it is simply
// another contribution.

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runTurn } from './agent/machine.js'
import { getFreddieHome } from './home.js'
import { runStep } from './machines/step-journal.js'

// Both runId and contributorId are agent-reachable (research_note/
// research_consolidate tools pass model-supplied strings straight through)
// and both are used to build filesystem paths -- allowlist to a safe
// identifier shape so neither can path-traverse (`../`, an absolute path, a
// drive letter, backslashes) out of the intended research-runs/<runId>
// folder. Live-caught by an adversarial G_INDEP review of this module: the
// original version had zero validation here, letting a crafted runId write
// anywhere the process could reach on disk.
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
function assertSafeId(value, label) {
    if (typeof value !== 'string' || !SAFE_ID_RE.test(value)) {
        throw new Error(`research_contribute: ${label} must match ${SAFE_ID_RE} (got ${JSON.stringify(value)})`)
    }
    return value
}

function notesDir(runId) {
    assertSafeId(runId, 'runId')
    return path.join(getFreddieHome(), 'research-runs', runId, 'notes')
}

// Ceiling on notes per run -- same bounded-worst-case discipline as casey's
// APPEND_FIELD_MAX_LEN: an unbounded accumulate-forever field/folder is a
// defect even when the common case is small (adversarial G_INDEP review
// finding #6 -- nothing previously stopped unbounded growth). A run that
// genuinely needs more should consolidate and start a fresh run, not grow
// one folder forever.
const MAX_NOTES_PER_RUN = 2000

// Dispatches ONE contributor turn against `prompt`, then writes its result as
// a new timestamped markdown note into runId's shared notes folder. Returns
// the written note's path + the turn's raw result. contributorId (default a
// fresh uuid) lets a caller name a specific contributor slot for resumability
// -- calling again with the SAME contributorId for the SAME runId returns the
// cached note (via runStep) rather than re-running the turn and creating a
// duplicate note. Concurrent same-runId/same-contributorId calls across TWO
// SEPARATE PROCESSES: step-journal.js's runStep resolves the write-write race
// itself (one wins, one gets a clear rejection) -- caught here so the loser
// gets a structured {error} instead of an uncaught rejection out of contribute().
export async function contribute({ runId, prompt, contributorId, model, callLLM, toolCtx, timeoutMs = 120000 } = {}) {
    const dir = notesDir(runId)
    const id = contributorId ? assertSafeId(contributorId, 'contributorId') : randomUUID()
    if (fs.existsSync(dir) && fs.readdirSync(dir).length >= MAX_NOTES_PER_RUN) {
        return { contributorId: id, error: `research_contribute: runId=${runId} already has ${MAX_NOTES_PER_RUN} notes (MAX_NOTES_PER_RUN) -- consolidate and start a fresh run instead of growing this one further` }
    }
    fs.mkdirSync(dir, { recursive: true })
    const stepId = 'contribute:' + id

    try {
        return await runStep(runId, stepId, async () => {
            const out = await runTurn({ prompt, model, callLLM, toolCtx, timeoutMs, approvalTimeoutMs: 0 })
            const ts = new Date().toISOString().replace(/[:.]/g, '-')
            const file = path.join(dir, `${ts}-${id}.md`)
            const body = [
                `<!-- contributorId: ${id} -->`,
                `<!-- ts: ${new Date().toISOString()} -->`,
                '',
                out.error ? `ERROR: ${out.error}` : (out.result || ''),
            ].join('\n')
            fs.writeFileSync(file, body)
            return { contributorId: id, file, result: out.result, error: out.error }
        })
    } catch (e) {
        // A cross-process write-write collision on the same (runId,
        // contributorId) pair throws out of runStep for whichever side loses
        // the race (step-journal.js's own at-most-once guarantee) -- surface
        // it as a structured result, same shape as every other failure path
        // here, rather than an uncaught rejection out of contribute().
        return { contributorId: id, error: String(e?.message || e) }
    }
}

// Writes ONE note directly from a caller-supplied body -- no LLM turn, for a
// contributor whose content is already deterministic (a web-search result
// set, a fetched page, any non-agent source). Same notesDir/safe-id/
// MAX_NOTES_PER_RUN/resumability discipline as contribute() above, just
// without runTurn in the middle. Same runId+contributorId pair returns the
// cached write (via runStep) rather than duplicating the note on a retry.
export async function contributeRaw({ runId, body, contributorId } = {}) {
    const dir = notesDir(runId)
    const id = contributorId ? assertSafeId(contributorId, 'contributorId') : randomUUID()
    if (fs.existsSync(dir) && fs.readdirSync(dir).length >= MAX_NOTES_PER_RUN) {
        return { contributorId: id, error: `research_contribute: runId=${runId} already has ${MAX_NOTES_PER_RUN} notes (MAX_NOTES_PER_RUN) -- consolidate and start a fresh run instead of growing this one further` }
    }
    fs.mkdirSync(dir, { recursive: true })
    const stepId = 'contribute-raw:' + id

    try {
        return await runStep(runId, stepId, async () => {
            const ts = new Date().toISOString().replace(/[:.]/g, '-')
            const file = path.join(dir, `${ts}-${id}.md`)
            const fileBody = [
                `<!-- contributorId: ${id} -->`,
                `<!-- ts: ${new Date().toISOString()} -->`,
                '',
                String(body || ''),
            ].join('\n')
            fs.writeFileSync(file, fileBody)
            return { contributorId: id, file }
        })
    } catch (e) {
        return { contributorId: id, error: String(e?.message || e) }
    }
}

// Lists every note currently in runId's shared folder, oldest first (by
// filename, which is timestamp-prefixed) -- the read side consolidate.js
// builds on. Returns [] for a runId with no notes yet (never throws on a
// missing/empty folder -- a run that has not been contributed to yet is a
// normal, expected state, not an error). A single unreadable/corrupted note
// file is skipped (recorded in the returned array's `error` field on that
// entry) rather than aborting the whole listing -- one bad file must never
// hide every other real note in the folder.
export function listNotes(runId) {
    const dir = notesDir(runId)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => {
            const file = path.join(dir, f)
            try {
                return { file, name: f, text: fs.readFileSync(file, 'utf8') }
            } catch (e) {
                return { file, name: f, text: null, error: String(e?.message || e) }
            }
        })
}

export function getNotesDir(runId) { return notesDir(runId) }
