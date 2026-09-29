# client-ui-directory-picker-native

## Rationale

- `FreddieNativeDirectoryFlow` (`src/client/flow.js`, `#alive`): unmount (HMR replacing the occupant) discards settlements wholesale, so the dead instance never adopts a path or drives the owner's error surface. The wire carries no per-request abort: the host-side chooser survives until answered and its answer lands nowhere; the replacement instance re-arms under the owner's still-open request.
- `flow.js`: renderless occupant; each rising `open` edge runs exactly one pick and reports exactly one outcome. `#armed` arms once per open so repeated setProps (and an adoption keeping `open` true while `busy`) never launch a second chooser; the owner withdrawing `open` re-arms.
- `src/index.js`: pure node half (empty apply so the plugin appears in cordis.yml / Loader); the OS chooser lives in the host workspace plugin's `pickDirectory`.
- `invariant.js`: no runtime invariant; the flow occupant registers into two workspace holes as one transactional effect and retains no state between picks.
