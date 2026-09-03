// research_consolidate.js -- on-demand consolidation of a research run's
// accumulated notes (see research_contribute.js) into one summary, adversarially
// reviewed before being accepted.
//
// Explicitly ON-DEMAND, never scheduled/automatic -- a caller triggers this,
// it is not a background job. Two-stage: (1) one drafting turn reads every
// note and produces a candidate consolidated summary; (2) N independent
// refute-only reviewer turns attack that draft (same G_INDEP shape as this
// repo's own AGENTS.md "Adversarial gm/lean verification loop" -- a reviewer
// sees ONLY the draft + the raw notes, never the drafting turn's own
// reasoning, and defaults to REAL DEFECT unless it can cite a specific note
// that supports each claim in the draft). Runtime research-workflow feature,
// not a dev-process technique -- the reviewers here run inside the SAME
// process as an ordinary consolidation call, no external orchestration.

import { runTurn } from './agent/machine.js'
import { listNotes } from './research_contribute.js'

// Live-witnessed: concurrent reviewer turns share the same provider chain's
// rate limit as everything else in the process -- a burst of reviewerCount
// simultaneous calls can legitimately exhaust it under load, surfacing as
// {error:'agent turn timeout'} on individual reviews (caught per-review
// below, never crashes the whole consolidation -- the draft and any reviews
// that DID complete are still returned). A caller seeing every review fail
// should check acptoapi's own chain-link/sampler backoff state before
// assuming this module is broken.
const DEFAULT_REVIEWER_COUNT = 3

function draftPrompt(notes) {
    const body = notes.map((n, i) => `--- note ${i + 1} (${n.name}) ---\n${n.text}`).join('\n\n')
    return [
        'You are consolidating raw research notes into one coherent summary.',
        'Read every note below and produce a single consolidated summary of what',
        'was found, covering every distinct claim the notes make. Do not invent',
        'anything not actually stated in a note -- if notes conflict, say so',
        'explicitly rather than picking one silently.',
        '',
        body,
    ].join('\n')
}

function reviewPrompt(draft, notes) {
    const body = notes.map((n, i) => `--- note ${i + 1} (${n.name}) ---\n${n.text}`).join('\n\n')
    return [
        'You have NOT seen why this summary was written and must not guess at intent',
        'charitably. Attack it: for each claim in the DRAFT SUMMARY below, check',
        'whether the RAW NOTES actually support it. Default verdict is REFUTED for',
        'any claim you cannot find direct support for in the notes. Report line by',
        'line: which claims are SUPPORTED (cite the note), which are REFUTED',
        '(no supporting note, or a note contradicts it), and whether anything a',
        'note states was OMITTED from the draft entirely.',
        '',
        'DRAFT SUMMARY:',
        draft,
        '',
        'RAW NOTES:',
        body,
    ].join('\n')
}

// Reads runId's full notes folder, drafts a consolidated summary, then runs
// reviewerCount independent adversarial reviewer turns against it. Returns
// { draft, notes: [...], reviews: [...], noteCount }. Never mutates the notes
// folder or any external store -- the CALLER decides what to do with the
// result (write it into a thatcher run row, discard it, re-run consolidation
// later after more notes accumulate). Throws if runId has zero notes -- there
// is nothing to consolidate, a caller should check listNotes(runId).length
// first rather than get a hollow "consolidated" empty summary.
export async function consolidate({ runId, model, callLLM, reviewerCount = DEFAULT_REVIEWER_COUNT, timeoutMs = 120000 } = {}) {
    const allNotes = listNotes(runId)
    if (!allNotes.length) throw new Error(`research_consolidate: no notes to consolidate for runId=${runId}`)
    // A note whose file failed to read (research_contribute.js's listNotes
    // marks these with text:null, error:<reason>) is excluded from the
    // consolidated content -- injecting a literal "null"/"undefined" string
    // into the draft/review prompts would read to the model as a real note
    // saying nothing, silently corrupting the consolidation. Reported back
    // via unreadableNotes so a caller can see it happened, not silently drop it.
    const notes = allNotes.filter(n => n.text != null)
    const unreadableNotes = allNotes.filter(n => n.text == null).map(n => ({ name: n.name, file: n.file, error: n.error }))
    if (!notes.length) throw new Error(`research_consolidate: all ${allNotes.length} note(s) for runId=${runId} failed to read -- nothing readable to consolidate`)

    const draftOut = await runTurn({ prompt: draftPrompt(notes), model, callLLM, timeoutMs, approvalTimeoutMs: 0 })
    if (draftOut.error) throw new Error(`research_consolidate: draft turn failed: ${draftOut.error}`)
    const draft = draftOut.result || ''

    const reviews = await Promise.all(
        Array.from({ length: reviewerCount }, () =>
            runTurn({ prompt: reviewPrompt(draft, notes), model, callLLM, timeoutMs, approvalTimeoutMs: 0 })
                .then(out => ({ result: out.result, error: out.error }))
                .catch(e => ({ error: String(e?.message || e) }))
        )
    )

    return { runId, draft, notes: notes.map(n => ({ name: n.name, file: n.file })), unreadableNotes, reviews, noteCount: notes.length }
}
