---
key: mem-0e476ceaeaa5d3c3-521
ns: default
created: 1782999678179
updated: 1782999678179
---

## Resolved mutable: mut-glyph-policy

freddie.js:228 Row code uses bare unicode dot with no aria-label/role=img -> decorative tell. shell.js AppShell uses Icon() for menu glyph (the sanctioned single-source path). POLICY: all inline unicode status/action glyphs convert to ASCII text ([on]/[off], on/off, [*]); any retained product icon must route through Icon(), never scattered inline unicode. Applies uniformly to ●○▶⏸↻↗↓◌ across freddie.js, shell.js StatusDot, content.js Alert, files.js, pages-*.js.
