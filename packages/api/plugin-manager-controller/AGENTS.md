# api-plugin-manager-controller

## Rationale

- `REQUEST_PATH_MODULES` (`src/index.js`): the inject-graph walk cannot see three kinds of dependency, so these modules are listed instead. The connection and the Typert loader are reached by route and by manifest; the preset roster is read by the API proxy through `ctx.get`; and the browser module servers, the inventory tab and its section are what draw the toggle. The list is keyed by module name, not entry id, because ids are a composition's own choice.
- `hostDependentsOf` (`src/index.js`): the provider of a service is any fiber under the entry's own fiber, since a Service constructed by a child plugin registers on the child. A dependent is any fiber outside that subtree whose `inject` names the service. Fibers are compared by `uid`: a Loader entry's `fiber` is a wrapper around the registry fiber, so identity never matches.
- `clientDependentsOf` (`src/index.js`): the browser graph is a second dependency graph the host Fiber walk does not carry. A package a row lists in `inject`, or one of whose subpaths a row imports through `external`, is needed by that row.
- Refusal before idempotence: a locked entry is refused even when the requested state is the state it already holds, so the answer for a locked id never depends on its current state.
- Effective state, not file state: the no-op check reads `entry.disabled`, which folds in every layer and any `!!js` expression, so an entry a bundle already disables answers `changed: false` for `disabled: true` instead of writing a redundant row.
- `switch` (`src/index.js`): calls queue behind one promise chain so the effective-state check and the write of one toggle cannot interleave with another's in this process; the config editor's profile lock serializes across processes.
- The write's error is logged and replaced by a fixed message: the underlying error names the profile path and the operating system's reason, which a browser has no use for.
- `describe` is pinned to loopback with `setDisabled` (see `client-connection`): a browser on a trusted non-loopback host learns from one 403 that switching is unavailable instead of rendering toggles that can only fail.
