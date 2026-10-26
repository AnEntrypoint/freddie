# 03-eliminate: trav-gm-37

session: orch-fin-1792994560-7712-22
row: trav-gm-37

## trav-gm-37-u1-api-loads

- Expected (row contract): `api.js` loads under node with its four re-exports (`RpcId`, `SESSION_SEARCH_RESULT_LIMIT`, `transportError`, `AbstractApiClient`) and no `resultOf` export.
- Probe: `node --input-type=module -e "await import('./packages/client/connection/src/client/api.js')"` in the project root (Bash, no dispatch id).
- Observed: export keys `["AbstractApiClient","RpcId","SESSION_SEARCH_RESULT_LIMIT","transportError"]`; `'resultOf' in m` = `false`; exit 0.
- Result: matches. Known.

## trav-gm-37-u2-local-reachable

- Expected: `1bc78c61170a7a7e23f1dc7d778399a0a1dd4601` is an ancestor of local `HEAD` `7bc6fe1f05da`.
- Probe: `git_log {limit: 300}` (dispatch `1792996723817-2126-e6484484f523e2b0`).
- Observed: entry `sha_full: 1bc78c61170a7a7e23f1dc7d778399a0a1dd4601`, subject `refactor(client): remove dead exports and a dead module, and share the head-tail cap`, within the 300 commits listed from `HEAD`.
- Result: matches. Known.

## new unknowns

None.
