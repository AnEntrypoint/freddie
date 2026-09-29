# client-ui-reference

## Rationale

- `src/client/index.js` registers one `@` source: file and session candidates are fetched in parallel through the cancellable generated Remote namespaces (a failed or aborted lookup yields no candidates), file candidates first, then sessions; quoted mentions skip session lookup.

- `src/invariant.js` installs nothing. No runtime invariant: a single input-trigger source registration whose disposal is proven by the HMR-safety spec; it emits no cordis events and owns no cross-plugin mutable state.
