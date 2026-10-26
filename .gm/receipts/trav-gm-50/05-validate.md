# trav-gm-50 — 05 validate

session: orch-fin-1792994560-7712-15 (executor); witness session orch-fin-1792994560-7712-15-v1 (independent verifier, subagent a1fb570b4b9ee7761)

## Expected values (written before the run)

- (a) settled-then-disconnect: copied_label=Copied, renders_after_disconnect=0
- (b) disconnect-while-clipboard-pending: renders_after_disconnect=0
- (c) control-no-disconnect: copied_label=Copied, renders_after_click>=1, final_label=Copy
- (d) RESULT: PASS, exit 0

## Observed (verifier run, /tmp/trav-gm-50/verify-run.txt)

    arm settled-then-disconnect copied_label=Copied renders_after_disconnect=0
    arm disconnect-while-clipboard-pending renders_after_disconnect=0
    arm control-no-disconnect copied_label=Copied renders_after_click=1 final_label=Copy
    RESULT: PASS no reset render after disconnect on either path
    exit=0

sha256 6e942c97bc0b9c6d0080fab84030e342a0ef79f25a0007b0192583b606bdef27

## Verdict

STATUS: verified (all four expected values match).

Pre-fix run on the same instrument (/tmp/trav-gm-50/head-run.txt, sha256 c5579abd1f50e85185ea428cd2743db4c7519002ea450e3051a9865c6ada1544): `RESULT: FAIL reset render after disconnect (settled=0 pending=2)`, exit 1. The pending path reproduces before the edit and is fixed by it. The row's cited settled-path defect does not reproduce at HEAD.

## Caveats

- The instrument is a machine-local JIT check: it lives in /tmp/trav-gm-50, imports the real CodeBlock.js and use-copy-feedback.js by absolute repo path, shims `@freddie/webjsx` (createElement and applyDiff) and the highlight module (intentionally unavailable). It is not a CI witness. It runs no browser and no GPU.
- Witness outcome is bound in .gm/witness-log.md (one line appended). That file is shared with other lanes and is left uncommitted here.
