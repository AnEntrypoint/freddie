# 01-orient: gui-disclosure-closed-aria-state-20261007

session: mcp-codemode-3535970-1793542718115-1-3
row file: .gm/prd/gui-disclosure-closed-aria-state-20261007.yml (subject only; no description or acceptance text)

## acceptance (derived)
- clause: "Actual ToolRow disclosure closed state omits aria-expanded while open exposes true. Preserve explicit false through renderer/consumer and verify native closed/open/close on real historical row."
- derived acceptance: the ToolRow disclosure exposes aria-expanded="false" when closed and "true" when open, with the explicit false preserved through the webjsx renderer and the DisclosureRow consumer; a native closed/open/close sequence on a real historical ToolRow shows those values.
- source: row subject (sole text in the row file).

## symbols (codeinsight, index complete after one sync pass)
- ToolRow: packages/client/ui-tool/src/client/tool/components/ToolRow.js:212-214 (function_declaration); renderToolRow at :206-210; class FreddieToolRow at :31-202.
- DisclosureRow: packages/client/ui-primitives/src/DisclosureRow.js:6-77 (function_declaration).
- callers: ToolRow 0 edges, DisclosureRow 0 edges (edges keyed by simple callee name; JSX-style use not recorded, so 0 is not evidence of no use).
- impact (callees) ToolRow: renderToolRow (ToolRow.js:206), createElement (framework/webjsx/src/createElement.js:16-43), assignChildrenUnlessRawHtml, flattenVNodes (framework/webjsx/src/utils.js:2-12), markChildrenForClearing.
- impact (callees) DisclosureRow: clsx, h, onToggle, preventDefault, stopPropagation.

## cited lines (read from the tree this dispatch)
- ToolRow.js:71 `const open = this.#expanded && expandable`; :70 `expandable = body !== null || outputText !== null || card !== null`.
- ToolRow.js:90-100 passes `open`, `expandable`, `expandOnRowClick: !fileLink` into DisclosureRow.
- DisclosureRow.js:23 `rowExpands = expandable && expandOnRowClick`.
- DisclosureRow.js:39-41 leading switches on `open`.
- DisclosureRow.js:54 `'aria-expanded': rowExpands ? open : undefined` (row div).
- DisclosureRow.js:64 `'aria-expanded': open` (leading button, used when expandable && !rowExpands).
- DisclosureRow.js:75 `open && children`.
- framework/webjsx/src/attributes.js:13-21 aria-* keys: null or undefined removes the attribute, any other value is setAttribute(String(value)), so a boolean false is written as "false".
- framework/webjsx/src/attributes.js:55 updates only when `value !== oldProps[key]`.

Observation for the next stage (not a cause): the renderer does not drop aria-expanded=false; the omission can only come from DisclosureRow.js:54 yielding undefined (rowExpands false, so expandable false or expandOnRowClick false) or from a path not yet traced. ELIMINATE must decide by a live run.

## searches
- codesearch dual, query "aria-expanded ToolRow disclosure closed": BM25 top 20 and vector top 20 nearest neighbours (ToolRow.js:14,22,42,47,51,79,83,155,206,212; DisclosureRow.js:6; SkillRow.js:88; CompactionItem.js:16; ReasoningRow.js:21,52; JsonTree.js:222). literal phrase matches 0; the BM25 group reported complete:false (route_without_index); rows are nearest neighbours, not occurrences.
- commits channel (13): 1269bc34 "fix(client): honour reduced motion and show keyboard focus in the GUI"; af038076 "perf(client): let chat row seats own their node read".
- grep literal "aria-expanded" under packages/client: 48 occurrences in 42 files; partial scope (1243 files scanned), not exhaustive. Relevant hits: DisclosureRow.js:54, :64; ToolRow path has no direct aria-expanded literal (it flows through DisclosureRow).

## live-state notes
- gm store lane was contended (store_busy, then dispatch_starved for ~120 s); codesearch succeeded on a later re-dispatch with the byte-identical body.

## successor
gm-unknowns (open unknowns: which DisclosureRow branch the closed ToolRow takes; whether expandable is false for the historical row; whether any layer between ToolRow and the DOM rewrites false; how a real historical row is loaded for the native check).
