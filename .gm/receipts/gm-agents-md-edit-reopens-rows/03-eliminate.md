# 03-eliminate: gm-agents-md-edit-reopens-rows

session: mcp-codemode-3535970-1793542718115-1-10

## U1 served daemon contains rs-plugkit 163f44fe (unknown_add gm-agents-md-edit-reopens-rows-u1)
- expected (from the row contract): an unrelated AGENTS.md line commit through the served daemon reopens 0 completed rows.
- probe: the only live probe is a commit touching AGENTS.md through the served daemon (git_commit calls reopen_rows_for_changed_paths). It is a publish to main, and if the served daemon predates 163f44fe it reopens completed rows that cite AGENTS.md (token-delivery-history, empty-verb-dir-skip), which is the defect under test. The restart that would make the daemon current is outside this lane (git_status bundle_action none).
- evidence: git_status 1793543378102-4268-24f4b41ea3ec3e0 (bundle_stale true, served 084e8858..., installed 3b5c6e55..., bundle_action none); neither sha resolves in /workspace/gm or /workspace/gm/rs-plugkit; git_show 1793543434965-2701-ce8943c6d23469b7 (163f44fe present).
- result: NOT RUN HERE. Recorded reason: probe is a main publish whose failure mode is the defect itself; daemon restart not available to this lane.

## U2 rule_bindings reopen on a cited section only (unknown_add gm-agents-md-edit-reopens-rows-u2)
- expected (from the row contract): a row citing AGENTS.md#<heading> reopens only when that section changes; an unrelated AGENTS.md edit leaves it pending.
- probe: needs a completed row that carries rule_bindings plus an AGENTS.md section edit committed through the served daemon. codesearch literal rule_bindings over .gm (codesearch literal, path .gm, this lane; dispatch id not captured) finds no stored rule_bindings on any row: the only hits are receipts and unknown files. A probe needs a new row, a witness, and a publish.
- result: NOT RUN HERE. Recorded reason: no existing row carries rule_bindings, so the probe needs a new row and a main publish.

## status
- U1 open, U2 open. Both need the live daemon or a new row; neither is answerable without a main publish.
- blocker: parent row annotated with prd_note (blocked_by external restart, gm-stale-mcp-bundle-restart). Separate blocker row refused by prd-add (blocker of open row).
- edit stage not entered (unknowns open).
