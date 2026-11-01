# 03-eliminate: gm-sibling-dream-rsi-ticker-repair

session: mcp-codemode-3535970-1793542718115-1-7

Expected values are derived from the row's contract (acceptance and subject), not from the code they check.

## U1: Does any runtime emitter produce `dreamrsi-replay` work?
- expected (row contract): at least one runtime `dreamrsi-replay` dispatch recorded by the sibling runner.
- probe: exec_js reads `.dispatch-ledger.json` JSONL in /workspace/gm and /workspace/freddie. dispatch 1793543420571-4305-b7f68d4a25a41a32.
- observed: /workspace/gm 10301 records, `dreamrsi-replay` 0, `dream-replay-cycle` 0. /workspace/freddie 1686 records, `dreamrsi-replay` 0, `dream-replay-cycle` 0.
- source literal scan (supporting): `dreamrsi-replay` appears only in `agentplug/scripts/daemon-idle-floor-witness.mjs:8` (verb-name list). dispatch 1793543382461-606-323fe83976dbcef8 (no_ignore, root /workspace/gm).
- result: MISMATCH. Premise of unhandled `dreamrsi-replay` work is not reproduced. Marked refuted-as-observed.
- the 5 freddie ledger hits for the string are this lane's own search and mutable-add bodies, not runtime work.

## U2: Does the sibling owner permit a change now?
- expected (row contract): no concurrent-owner dirty state on the ticker or dream path.
- probe: exec_js git status and diff in /workspace/gm. dispatch 1793543397920-4294-f4f48b8a7608e62f (status), 1793543408973-4298-72ab280d55619460 (agentplug diff).
- observed: top-level tree has 14-16 dirty entries (submodule pointers and skills files moving). `agentplug` has uncommitted `crates/agentplug-runner/src/daemon.rs` (+33/-2) and `daemon/claim_dispatch.rs` (+26), owner work on heartbeat-ticker authority. `rs-plugkit` tree was dirty in the first probe (gates.rs, deviations.rs, predicate_registry.rs staged) and clean on the re-check; its HEAD moved to 868a152a, so owner activity is live.
- result: MISMATCH. Owner dirty state persists in the agentplug runner; the sibling is not in a permitting state. Mutation unsafe per the row's own subject.

## U3: Which file(s) would an edit touch, and does the row name any?
- expected (row contract): the row names a file or the ticker is locatable by a single path.
- probe: codesearch literal `replay_if_due`, root /workspace/gm, dispatch 1793543383474-614-5dd0e5ce92a2b081.
- observed: the guest-side trigger is `replay_if_due` at `rs-plugkit/crates/plugkit-core/src/orchestrator/dream_cycle.rs:38`, called from `rs-plugkit/crates/plugkit-core/src/orchestrator/dream_rsi/record.rs:463`. The verb handler is `dream_cycle.rs` (`dream-replay-cycle`, `mod.rs:414`, `gates.rs:206`). `agentplug/AGENTS.md:17` says the runner no longer ticks the dream cycle.
- result: candidate located, but the row names no file. Edit target remains unnamed. Per gm-prd rules an executor never guesses a file.

## U4: Does `dream-replay-cycle` with a valid session_id return a replayed receipt without policy deployment?
- expected: replayed receipt, no policy deployment.
- probe: not run. Gated on U2 (owner dirty, the row's own condition). A dispatch against /workspace/gm would write `.gm/dream-rsi` state into owner-dirty territory. A dispatch in /workspace/freddie would exercise freddie's daemon, not the sibling ticker the acceptance names, so it cannot witness this row.
- result: cannot run here. Exact reason recorded above with U2 dispatch id 1793543397920-4294-f4f48b8a7608e62f.

## new unknowns
- none beyond U1-U4.

## disposition
- U1 mismatched (premise not reproduced), U2 mismatched (owner dirty), U3 candidate with no row-named file, U4 not runnable here with reason. No unknown is known in the sense of permitting an edit.
- EDIT is not allowed by these results. Filing blocker per gm-prd; no file is edited.
