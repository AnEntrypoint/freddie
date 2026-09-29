# client-ui-directory-picker-native

## Rationale

- `FreddieNativeDirectoryFlow` (`src/client/flow.js`, `#alive`): unmount (HMR replacing the occupant) discards settlements wholesale, so the dead instance never adopts a path or drives the owner's error surface. The wire carries no per-request abort: the host-side chooser survives until answered and its answer lands nowhere; the replacement instance re-arms under the owner's still-open request.
