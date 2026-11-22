# client-ui-reference

## Rationale

- `src/client/index.js` registers one `@` source: file and session candidates are fetched in parallel through the cancellable generated Remote namespaces (a failed or aborted lookup yields no candidates), file candidates first, then sessions; quoted mentions skip session lookup.

