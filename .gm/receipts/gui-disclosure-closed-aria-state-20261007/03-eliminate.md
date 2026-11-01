# 03-eliminate: gui-disclosure-closed-aria-state-20261007

session: mcp-codemode-3535970-1793542718115-1-3
instrument: out-of-repo JIT probes in /tmp/gmprobe-gui-disclosure/ (register.mjs, hooks.mjs, webjsx-capture.mjs, primitives-stub.mjs, clsx.mjs, card-model-stub.mjs, toolview-stub.mjs, probe.mjs, probe-transition.mjs, probe-bash.mjs). Nothing under the repo was written except this receipt and the .gm row/unknown records.
instrument scope: real ToolRow.js, DisclosureRow.js, bash-sample.js, webjsx createElement.js, attributes.js (real). Stubbed: @freddie/webjsx applyDiff (captures the vdom instead of touching a DOM), primitives index (DisclosureRow is real), clsx (no node_modules on this host), card/tool models and locale for the bash row. Attribute layer driven by setAttributes/updateAttributes on a fake element, which is the same call pair createDOMElement and applyDiff make. This is not a native DOM run.

## expected values (written before each run, from the row's contract)
- u1: a closed expandable row exposes aria-expanded="false" on the expander; open exposes "true"; a non-expandable row exposes no aria-expanded.
- u2: an explicit false prop reaches the DOM as the string "false".
- u4: fileLink rows put aria-expanded on the leading button, not the row div; closed "false".
- u5: closed -> open -> closed ends at "false".
- u6: no DisclosureRow change indicated if u1 holds.
- u8: the bash toolview sibling matches u1.
- u3, u7: a real historical row would show false/true/false.

## runs
- dispatch 1793543532334-850-aa2354077ce99c (exec_js, probe.mjs): closed/open/closed for outputOnly, outputFileLink, cardOnly, bodyOnly all gave vdom and DOM "false" / "true" / "false"; outputFileLink expander is the button (holders 2), row div has no aria-expanded; none gave no expander.
- dispatch 1793543533000-852-2311a53a74e74a64 (exec_js, probe-transition.mjs): no output -> not expandable, no expander; output arrives closed -> "false"; opened -> "true"; closed again -> "false".
- dispatch 1793543601234-892-8f2820f8d8fb2d24 (exec_js, probe-bash.mjs): bash toolview terminal present -> "false"/"true"/"false"; terminal absent -> no attribute. (An earlier run of the same probe, which did not capture its dispatch id, is the one the u8 resolution was filed against; the id above is the recorded one.)
- dispatch 1793543349947-540-4054597e12c966be (gm.grep literal DisclosureRow): consumers ContextInjectionRow, GenericCommandCard, ReasoningRow, WorkflowRunPanel (forces expandable true), ToolRow.
- dispatch 1793543462383-779-932aa3670a0c83bf (grep, historical): no historical session data inside the repo.
- dispatch 1793543541751-856-c6430eaceeb13ef1 (exec_js host check): DEEPSEEK_API_KEY unset; root node_modules absent; clsx not installed; FREDDIE_HOME unset; ~/.freddie and repo .freddie absent. chromium cache present (/config/.cache/chromium).

## verdicts
- u1 known: observed closed expandable -> "false"; closed non-expandable -> absent (DisclosureRow.js:54 and :64 yield undefined only when there is no expander, and open is unreachable there).
- u2 known: createElement.js:16-43 does not filter props; attributes.js:13-21 writes String(false) for aria-* keys; observed "false" in vdom and DOM.
- u4 known: observed fileLink branch: aria-expanded on the leading button (DisclosureRow.js:64) only; closed "false", open "true".
- u5 known: observed transition closed/open/closed ends "false" (updateAttributes compares against old props, attributes.js:55).
- u6 known: all DisclosureRow consumers share the same expression at lines 54 and 64, and that expression already emits explicit false for expandable rows. No DisclosureRow change is indicated by any observed behavior.
- u8 known (new, from the sibling bash toolview): same as u1.
- u3 OPEN: the values of a real historical ToolRow (body, output, card, filePath, onOpenFile) come from the session store. dispatch 856 found no store on this host (FREDDIE_HOME unset; ~/.freddie and repo .freddie absent). Consumers are enumerated (read-row, search-row, web-row, todo-row, file-mutation-row, ask-question-row, GenericToolCard all call renderToolRow in a ref callback). Every props shape those consumers can produce (output, card, body, fileLink, none) was run in the matrix; only the real values remain unknown.
- u7 OPEN: native closed/open/close on a real historical row needs (a) that row's data (absent, see u3), (b) installed client deps (clsx and the rest of node_modules absent, so the bundle cannot load in chromium), (c) an owner-side session for a live boot (DEEPSEEK_API_KEY unset). The gpu-free attribute probe answers the attribute layer, not the native DOM.

## what the probes say about the reported symptom
The reported defect (closed omits aria-expanded while open shows true) does not reproduce at ToolRow, DisclosureRow, webjsx or the bash toolview sibling for any props shape or transition run here. Every closed state that has a disclosure emits explicit "false". The only closed state with no aria-expanded is a row with nothing to expand, where open is unreachable. The premise may be stale, or the defect lives in a real historical row whose data this host cannot supply. Neither can be settled here, so no cause is derived and EDIT does not start.

## blocker
Filed as a blocker row, the row stays pending with blocked_by in its text. See the DELIVERY line in the executor report.

## correction (appended after the blocker step)
- prd-add refused a separate blocker row for an open parent (blocker_row_refused, dispatch refused-mcp-codemode-3535970-1793542718115-1-3-3535970-1793543631718-2447). The blocker is recorded instead as a prd-note on the parent row (dispatch 1793543640384-904-1270a1eb9f76118d) with blocked_by: gui-disclosure-closed-aria-state-20261007-blocker-mcp-codemode-3535970-1793542718115-1-3, and the row stays pending.
