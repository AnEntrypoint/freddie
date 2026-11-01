# 02-unknowns: gui-disclosure-closed-aria-state-20261007

session: mcp-codemode-3535970-1793542718115-1-3
recorded with mutable-add (ids are row-prefixed)

- u1 (gui-disclosure-closed-aria-state-20261007-u1): Does a closed historical ToolRow reach DisclosureRow with expandable true (row div gets aria-expanded="false") or expandable false (attribute omitted)? Sources: ToolRow.js:70, DisclosureRow.js:23, :54.
- u2 (...-u2): Does webjsx createElement or applyDiff rewrite or drop a boolean false prop before attributes.js:13-21? Sources: framework/webjsx/src/createElement.js:16-43, applyDiff.
- u3 (...-u3): Which consumer creates historical ToolRow props, and what body, output, card, filePath, onOpenFile values do they carry? Sources: call sites of renderToolRow and ToolRow outside ToolRow.js; ToolRow.js:70, :78.
- u4 (...-u4): Does a historical row take the fileLink branch (expandOnRowClick false), putting aria-expanded on the leading button (DisclosureRow.js:64) and omitting it from the row div (:54)? Sources: ToolRow.js:78, :100; DisclosureRow.js:23, :52-54, :64.
- u5 (...-u5): After closed, open, closed, does applyDiff leave aria-expanded="false" or a stale "true"? Sources: attributes.js:55; ToolRow.js:51-53.
- u6 (...-u6): Which other DisclosureRow consumers pass expandable with open false, so a change at DisclosureRow.js:54 or :64 changes their exposed state? Sources: grep DisclosureRow under packages/client.
- u7 (...-u7): Can closed, open and close of a real historical ToolRow be produced gpu-free (DOM shim) or does the native check need a browser? Sources: how historical rows are loaded (transcript replay entry).

Successor: gm-eliminate (every unknown is open; none is resolved by reading).
