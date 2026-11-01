# 01-orient: gm-agents-md-edit-reopens-rows

session: mcp-codemode-3535970-1793542718115-1-10
row: .gm/prd/gm-agents-md-edit-reopens-rows.yml (status pending, no file list, no acceptance_criteria field)

## acceptance (in row subject, not derived)
"Witness: edit an unrelated AGENTS.md line and confirm no row reopens; edit the witnessed rule and confirm the row reopens."

## symbols (codeinsight, dispatch 1793543354509-554-18f7a09584fbca3a, 1793543355089-556-2399cf5ab94b7601)
- reopen_rows_for_changed_paths: /workspace/gm/rs-plugkit/crates/plugkit-core/src/orchestrator/prd.rs:2378-2507. Callers: git_commit (crates/plugkit-core/src/wasm_dispatch/verbs/git.rs:4383), git_finalize (git.rs:6426).
- stale_completed_rows: prd.rs:2005-2064. Callees used: row_referenced_paths (prd.rs:103-124), rule_section_fingerprint (prd.rs:169-175), path_is_within (prd.rs:1838).
- Reopen reason "module {module} changed after this row was witnessed": prd.rs:2056 (codesearch literal, located).

## source facts
- row_referenced_paths drops markdown paths through is_markdown_path before pushing a module reference. At rs-plugkit HEAD an AGENTS.md change cannot produce the module reason. Dispatch 1793543434965-2701-ce8943c6d23469b7 (git_show of 163f44feb4a6e1f6e1adc2809f1dea8d05bfcafe) shows that exclusion added in that commit.
- 163f44fe, 2026-10-12 18:54:47 +0200, "fix(prd): bind witness rule references to their cited section, not the whole file", is in the history of rs-plugkit prd.rs (git_log path, cwd /workspace/gm/rs-plugkit). It adds rule_bindings: a row citing AGENTS.md#<heading> binds that section fingerprint only; stale_completed_rows reports "rule {path}#{anchor} changed" for it.
- Trigger commit 8f254509 (freddie, 2026-10-12 17:24:39 +0200) predates the fix by 90 minutes.
- freddie AGENTS.md has no commit after 8f254509 (git_log path AGENTS.md, dispatch 1793543499669-825-8fdcccbe24c86677).
- Rows named in the subject, token-delivery-history and empty-verb-dir-skip, are status completed on disk now (.gm/prd/token-delivery-history.yml).
- Module reopen for non-markdown code paths is intended (e.g. token-delivery-history cites session/src/index.js:431).

## served-daemon provenance (open)
- gm git_status (cwd /workspace/freddie): bundle_stale true, bundle_served_sha 084e8858..., bundle_installed_sha 3b5c6e55..., bundle_action none, restart required.
- Neither sha resolves in /workspace/gm or /workspace/gm/rs-plugkit (git_log ref).
- The installed bundle at /data/cache/gm/.gm-tools/gm-mcp-server.mjs is minified; a literal scan under that root is incomplete (zero hits are not findings).
- The live witness needs an AGENTS.md commit through the served daemon, so it cannot be read from source.

## open for gm-unknowns
U1 served daemon runs code containing 163f44fe (open, live check = AGENTS.md commit).
U2 rule_bindings path reopens a row when a cited AGENTS.md section changes (source present, not live-run).
