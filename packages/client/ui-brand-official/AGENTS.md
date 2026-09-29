# AGENTS.md - ui-brand-official

## Rationale

- `src/invariant.js` installs nothing: the package retains no mutable state and its three slot occupants install and leave through one transactional effect. The node half is an empty apply so Loader has a host row; the browser half ships through `exports["./client"]`.
