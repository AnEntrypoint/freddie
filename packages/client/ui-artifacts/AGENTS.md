# AGENTS.md — ui-artifacts

## Rationale

- `src/invariant.js` installs nothing. No runtime invariant: the host entry `src/index.js` registers nothing, and the browser half contributes one `conversation.view` slot entry whose durable data is owned by the `artifacts` projection and the `sessionArtifacts` Remote; the view keeps only local selection and drafts and emits no cordis event.
