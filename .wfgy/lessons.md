## 2026-09-04 -- vendor cache split must include patched webjsx

Goal (G): Troubleshoot the Freddie harness, identify real issues, and fix them with live verification.
What drifted / what went wrong: After splitting `/vendor/` cache so only `@freddie/` stayed `no-cache`, patched `webjsx@0.0.73` kept `immutable` under an unchanged version URL — the same stale-crash class the original blanket `no-cache` was meant to stop. The live web process also does not HMR host plugins, so a source edit is not proven until `serveVendor` is invoked in-process or the process restarts.
Fix / resolution: Treat `@freddie/`, `webjsx@`, and unversioned stubs as `no-cache`; keep other versioned third-party paths `immutable`. Verify `serveVendor` in-process, not only against the already-booted GUI.
Generalizes to: A versioned URL is immutable only when contents cannot change without the version changing. Local patches and workspace-linked packages fail that test. Host HMR is off for web; live GUI headers can lag source.
