# 04-edit: gui-perf-next-input-startup-20261006
session: mcp-codemode-3535970-1793542718115-1-16

## row re-scope
The row named no file. Re-scoped under the same id with prd-add overwrite:true (dispatch 1793544447704-973-7f88b9e4fcd9a4ea), naming framework/webjsx/src/attributes.js and framework/README.md, with the proved-cost description and derived acceptance.

## changed paths
1. framework/webjsx/src/attributes.js: `ref` is skipped in the prop-write loop (updateAttributesCore, continue list) and excluded from the removal loop, symmetric with children/key/dangerouslySetInnerHTML/nodes. assignRef in applyDiff.js:178 and createDOMElement.js:27 still handles the callback.
2. framework/README.md: divergence entry 22 notes that `ref` is consumed by assignRef and never serialized as an attribute.

## callers (codeinsight, before edit)
- updateAttributesCore (attributes.js:43-100): 4 edges, from setAttributes (104, 108) and updateAttributes (114, 118). Signature unchanged.
- updatePropOrAttr (attributes.js:13-42): 1 edge, from updateAttributesCore:57. Unchanged.

## effect (live, owned headless chromium, gpu-free)
| metric | baseline | post-edit |
|---|---|---|
| ref attribute on composer textarea | present | absent |
| ref attribute on 25 slot outlets | present | absent |
| no-op attribute writes per keystroke | 23 | 0 |
| DOM mutation records per keystroke | 37 | 14 |
| input p50 ms (3 runs) | 9.8, 10.1 | 10.8, 9.7, 10.0 |
| input p90 ms | 17.6, 17.6 | 17.1, 16.9, 16.8 |
| input max ms | 29.3, 26.1 | 22.8, 22.6, 24.0 |
| draft/caret abcXdef caret 4 | pass | pass |
| focus and typing after ref change | ok | ok |
| cold start textarea ms (3 runs) | 932, 1148, 1039 | 949, 1017, 1003 |
| JS modules at boot | 245 | 245, 245, 246 |

Honest read: the 23 no-op writes per key are removed (counted cost proved). Input latency is not measurably changed in this instrument: p50 is within the run-to-run band, p90 and max drift lower by under 1 ms and 5 ms. The completion claim is limited to the removed writes; no latency win is claimed.

## instrumentation
All probe scripts live in /tmp/gui-perf-20261006 (outside the repo). Nothing instrumental is in the tree.

## open
none. Next: gm-publish (executor steps 1-2). Verification (gm-validate) is a separate lane spawned by the orchestrator, not loaded here.
