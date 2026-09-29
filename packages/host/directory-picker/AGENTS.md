# AGENTS.md — directory-picker

## Rationale

- Service Definition of the `ctx.directoryPicker` seam. Backends differ in interaction shape, so it exposes a discriminated `capability()` (`native`: one OS chooser on the host display; `browse`: listing/creation primitives that also serve remote clients). Consumers switch on `capability().kind`; the union is merge-extensible and an unknown kind hides the picking affordance rather than failing.
- One implementation per context (a second throws, cordis' duplicate-service behavior); the capability object is stable for the service lifetime and may be captured. `DirectoryPickerError` carries a closed business code so consumers avoid string matching. The invariant is empty: backends and the RPC consumer own observations.
