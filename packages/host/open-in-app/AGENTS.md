# AGENTS.md — open-in-app

## Rationale

- `src/index.js` open route: launches the availability map's already-verified launcher, never a re-detection, so a click cannot be steered at an application this host never proved it holds.
- `src/catalog.js` `GIT_FOR_WINDOWS_DISPLAY_NAME_PREFIX`: Git for Windows registers as "Git version <x.y.z>"; a bare "Git" prefix would also match "GitHub Desktop".
- `src/resolver.js` `fixedLocatorWithTrustedIcon`: an OS-shipped entry's icon path is trusted, not probed; a missing file surfaces as a 404 at extraction, and only an unset variable such as `${SystemRoot}` drops the icon claim.
- `xcode` locator: `xed` is the supported open verb; the bundle launch follows only when the CLI lost the association.
- `github-desktop` locator: `github open <path>` is GitHub Desktop's supported open verb; the Electron binary reaches it only by running the packaged CLI as node (`ELECTRON_RUN_AS_NODE`), and that adapter process is the one to hide (`windowsHide`).
- `runShellOpen`: the opener is never aborted (`neverAbortedSignal`). The watch window already decided the outcome, and terminating a shell opener that raised the user's window would race the answer the route gave.
