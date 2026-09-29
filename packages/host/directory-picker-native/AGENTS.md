# AGENTS.md — directory-picker-native

## Rationale

- `src/native-picker.js` win32: koffi is a packaged dependency the install guarantees, so the IFileOpenDialog child is the only tier; there is no PowerShell fallback and any failure surfaces as-is.
- `src/win32-dialog-bindings.js`: vtable slots and out-pointers are pointer-width offsets (`koffi.sizeof('void *')`: 8 on x64/arm64, 4 on ia32). A missing per-thread DPI symbol (pre-1607 Windows) or a host refusing every DPI context proceeds without DPI opt-in (blurry above 100 % scaling) rather than failing the pick.
- `src/win32-dialog-logic.js` `runFolderDialog`: once COM is initialized (S_OK or S_FALSE) it must be uninitialized exactly once on every path.
- `src/win32-dialog-worker.js`: `process.send` must be bound (node reads `this.connected`); the message is flushed before disconnecting; parent `disconnect` exits the worker so a dead parent never orphans an on-screen dialog; no top-level await because the built worker ships as CJS.
- `src/win32-dialog.js` abort path: the `showing` notice precedes the blocking `Show`, so the first `WM_CLOSE` can race window creation. `serviceAbort` re-posts on an interval and force-kills after `CLOSE_MAX_ATTEMPTS`; the budget runs even before `showing` (child hung in koffi/COM init) so the promise never dangles. Rejected close attempts are discarded (the interval retries, kill is the backstop). An abort that raced ahead of `showing` posts the close once the notice arrives.
