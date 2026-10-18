# SPECIFY
Row: gm-freddie-adapter-canonical-fields-20261007. Claim: registered Freddie tool-gm schemas expose max_count and a git_show object while the live daemon accepts limit and rev; fix schema, current references and README from accepted_fields, keep historical raw logs, verify registration and daemon dispatch.
Cited lines checked against tree (HEAD 0f12e0ec):
- packages/gm/tool-gm/src/verbs.js:294-300 gm_git_log exposes limit (number). Current.
- packages/gm/tool-gm/src/verbs.js:318-324 gm_git_show exposes rev (string). Current.
- packages/gm/tool-gm/README.md:27,29 lists gm_git_log limit? and gm_git_show rev?. Current.
- max_count: codesearch literal over packages/ (2966 files, exhaustive) = 0 matches. Stale as a tree defect.
- DESIGN-LOG.md:184,195 and .gm/prd.yml:132 describe the historical failure; historical text, not a schema.
Unknown recorded: which commit introduced limit/rev (not located; latest path touch f4dc4f7c).
