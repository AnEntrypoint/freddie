# AGENTS.md — ui-open-in-app

## Rationale

- `controller.js` repeats the three route paths instead of importing `@freddie/freddie-host-open-in-app/shared`: the host package is not a client module and the browser has no route to import it.
- `OpenInAppAction.js` marks a busy launch with `aria-disabled` rather than `disabled`: a focused button that becomes disabled loses focus in the browser, which would strand keyboard users mid-launch.
- `index.js` registers with `order: -10` so the split button sits left of the other utilities entries, whose default order is 0.
- Failures collapse to "unavailable" in `controller.js` on purpose: the host answers 403 to any non-loopback Host, and a rejected offer must look identical to an absent one.
- `src/invariant.js` installs nothing. No runtime invariant: the host entry `src/index.js` registers nothing, and the browser half contributes one header slot entry over three host routes whose validation lives in `freddie-host-open-in-app`; the only state it owns is the remembered choice in `localStorage`, which is read and written by the browser alone.
