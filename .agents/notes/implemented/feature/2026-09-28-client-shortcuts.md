# Agent Note: the client keyboard capability, ported from dsh's `client/shortcuts` and `client/ui-shortcuts` as one package

Status: implemented

## Problem

The completed 22-package dsh client capability audit left two adjacent GAP verdicts: `client/shortcuts` — *"Customize application keyboard commands for each device"* — and `client/ui-shortcuts` — *"Browse the commands available in the current window and find them by action, English alias, or key."* They ranked 8th and 9th by impact, and they are two halves of one capability: a registry with no discovery or rebind surface delivers customized bindings a user can neither find nor restore, and a reference UI with no registry behind it is an empty list with nothing to edit.

Freddie had no keyboard layer at all. No package registered a command, no slot carried a reference, and nothing resolved a window-level gesture.

## Decision

Port both as **one** package, `packages/client/shortcuts` (`@freddie/freddie-client-shortcuts`).

The justification is not tidiness. `packages/client/AGENTS.md` forbids a package from importing another package's internals, so the browser needs the registry's catalog and the protocol's normalization, reservation, and conflict rules through a *public* export surface. In a two-package split that surface exists only so the sibling can consume it — exported symbols with exactly one consumer, which is the shape AGENTS.md's export discipline exists to prevent. One package keeps `protocol.js`, `registry.js`, `search.js`, and `recorder.js` internal and exports only `apply`, `inject`, and the Cordis service. The alternative reading — that the UI is separable because it only reads observables — fails on the edit path: the recorder and the candidate review call `describeBinding`, which is protocol logic, not presentation.

Adaptations, each forced by a freddie fact:

- **Buildless plain JS with JSDoc.** No TypeScript, no build step; every module is served directly. Types are `@typedef` blocks in `protocol.js` and `registry.js`.
- **No Desktop half.** Electron and desktop frameworks are excluded from the stack, so the `desktop:*` profiles, the two-key chord (`secondCode`), and the native window bridge are gone. A chord is rejected on Web by `isWebBindingAllowed` anyway, so keeping the field would be dead code.
- **One storage key, Web profiles only.** `dsh.keybindings.v1` → `freddie.keybindings.v1`; profiles are `web:macos`, `web:windows`, `web:linux`, so a binding set on one device never applies to another.
- **Windows and Linux share one allow-list.** Upstream narrowed Linux to three explicit combinations; Linux desktop browsers are the same Chromium/Firefox family as Windows and share the Control-primary convention and the same reserved set, so the narrowing bought nothing and left Linux with three bindable combinations. Both now admit three or more modifiers, primary Comma/Backslash, Control+Backquote, primary+alt/shift, and the three explicit defaults.
- **No new npm dependency beyond `@freddie/webjsx`,** which every sibling webjsx client package already declares. `clsx` was avoided by composing class strings inline.
- **Freddie idioms.** `renderModal` from `ui-primitives` for the dialog (headless, so the package owns its header), `webjsxSlot` for both contributions, hand-authored `X.css` + `X.css.js` token maps, and a `shortcuts` locale namespace with per-locale dictionaries.
- **Two slot contributions, one owned command.** `settings.general.item` gets the row; `shell.overlay` gets the reference dialog, which names itself `shortcuts` via `data-shortcut-modal` so a command bound to a modal answers only inside that modal. `shortcuts.open` (Mod+/, from page, text entry, and terminal) is the only command this package owns; every other command belongs to the feature that implements it.

### Security posture

A keyboard layer sits on the browser's key path, so four rules are enforced in code, not by convention:

- **Nothing is recorded beyond the gesture.** `KeyRecorder` holds one in-memory candidate, cleared on every stop. Nothing is written anywhere but the preference document, and nothing is logged — not a candidate, not a rejected one.
- **No standing interceptor.** Listeners exist only between `start()` and `stop()`, and are removed on capture, cancellation, blur, and disposal. The window adapter is installed through a `ctx.effect` disposer.
- **Reserved combinations stay reserved.** Escape, Tab, Space, Backspace, Delete, and the arrows are refused unconditionally; so are the clipboard and window keys under the primary modifier, primary+A without Shift, and the platform-specific Meta and Alt combinations. The event is consumed only when a command actually handles it, so an unmatched or abstaining combination always reaches the browser — a binding can never remove the only way out of a field.
- **Deny, never partially apply.** A document that is unparsable, carries an unknown field, names an unknown profile or command id, or declares a future schema version is classified `invalid` or `future`; the defaults stand, dispatch keeps working, and edits are refused with `unreadable`.

## Alternatives considered

**Two packages, mirroring upstream.** Rejected above: it would force the protocol and catalog into a public export surface whose only consumer is the sibling, and it would make the edit path cross a package boundary for protocol logic.

**Persist bindings in the host settings file.** Rejected: bindings are per-device and origin-local, not per-installation; a host round trip per keystroke edit would also put a key-recording path on the wire, which the security posture rules out.

**A fuzzy-match library for search.** Rejected: it would be the package's only real dependency, and ordered-subsequence matching over a few hundred rows is cheap enough to run per keystroke while staying deterministic and explainable.

**Capture-phase global interception for dispatch.** Rejected: it would let a binding swallow input the local control owns. Dispatch runs on the bubble phase so the composer, a terminal, or an embedded page arbitrates first.

**Apply whatever parses from a malformed document.** Rejected: a half-applied set is worse than defaults — a command can end up bound to something the user never chose, and a silently dropped override is invisible.

## Consequences

Verified by running the real code against real state (`node .gm/scratch-sub22/verify-shortcuts.mjs`), not by inspection. Sections 1–4 drive the real `ShortcutRegistry`, `ShortcutPersistence`, `effectiveShortcuts`, `bindingIssue`, and the search functions with plain objects — no DOM involved. Sections 5 and 5b drive the real `KeyRecorder` and the real `installKeyboard` with hand-built DOM stand-ins; **no part of this ran in a browser**, so the recorder's real listener wiring, the dialog's focus behavior, and the modal region detection remain browser-unverified.

```
=== 1. real registry with real registrations ===
definitions: [{"id":"shortcuts.open","defaults":{"web:macos":{"code":"Slash","modifiers":["primary"]}, ...}},
  {"id":"session.new",...},{"id":"sidebar.left.toggle",...},{"id":"terminal.new",...},
  {"id":"input.send","defaults":{},"fixed":[{"code":"Enter","modifiers":[]}]}]
loading catalog (no bindings accepted yet):
  shortcuts.open         keys=["Ctrl","+","/"] modified=false issue=null
  session.new            keys=["Ctrl","+","Shift","+","N"] modified=false issue=null
  sidebar.left.toggle    keys=["Ctrl","+","Shift","+","B"] modified=false issue=null
  terminal.new           keys=["Ctrl","+","Shift","+","T"] modified=false issue=null
reject an unusable default: rejected: Unsupported Web shortcut: bad.escape
reject a reserved default: rejected: Reserved shortcut default: bad.backspace

=== 2. real persistence: read defaults, then rebind ===
initial read: {"status":"ready","usingDefaults":true,"revision":"4:1b03e749-..."}
ready catalog:
  shortcuts.open         keys=["Ctrl","+","/"] aria=Control+/
  session.new            keys=["Ctrl","+","Shift","+","N"] aria=Control+Shift+N
  sidebar.left.toggle    keys=["Ctrl","+","Shift","+","B"] aria=Control+Shift+B
  terminal.new           keys=["Ctrl","+","Shift","+","T"] aria=Control+Shift+T
dispatch Mod+Shift+N  -> handled(session.new) consumed=true runs= ["session.new"]
dispatch Mod+Shift+B  -> handled(sidebar.left.toggle) consumed=true
rebind session.new -> Mod+Shift+M: {"status":"saved","revisionChanged":true}
AFTER REBIND
  dispatch Mod+Shift+M -> handled(session.new) consumed=true runs= ["session.new"]
  dispatch Mod+Shift+N -> pass consumed=false runs= ["session.new"]
  catalog row: {"id":"session.new","binding":{"code":"KeyM","modifiers":["control","shift"]},"modified":true,
    "issue":null,"conflicts":[],"label":"New session","aliases":["new session","create session"],
    "keys":["Ctrl","+","Shift","+","M"],"aria":"Control+Shift+M"}
  overrideCount: 1

=== 2b. rejected edits leave the accepted bindings alone ===
stale revision      -> "stale"
occupied combination-> {"status":"conflict","conflicts":["session.new"]}
reserved key        -> {"status":"conflict","issue":"reserved"}
no modifier         -> {"status":"conflict","issue":"modifier-required"}
fixed action key    -> {"status":"conflict","conflicts":["input.send"]}
session.new still bound to: ["Ctrl","+","Shift","+","M"]

=== 2c. reset-all returns every row to its default ===
reset-all -> {"status":"saved","count":0}
session.new keys after reset: ["Ctrl","+","Shift","+","N"]
dispatch Mod+Shift+N -> handled(session.new) consumed=true

=== 3. discovery: what the reference lists, and search by action/alias/key ===
rows (5):
  [application] shortcuts.open         Open the shortcut reference  keys="Ctrl+/"
  [application] session.new            New session                  keys="Ctrl+Shift+N"
  [application] sidebar.left.toggle    Toggle left sidebar          keys="Ctrl+Shift+B"
  [application] terminal.new           New terminal                 keys="Ctrl+Shift+T"
  [input] input.send                   Send message                 keys="Enter"
query ""               -> ["shortcuts.open","session.new","sidebar.left.toggle","terminal.new","input.send"]
query "new"            -> ["session.new","terminal.new"]
query "sidebar"        -> ["sidebar.left.toggle"]
query "toggle sidebar" -> ["sidebar.left.toggle"]
query "create session" -> ["session.new"]
query "Ctrl+Shift+N"   -> ["session.new"]
query "ctrlshif"       -> ["session.new","sidebar.left.toggle","terminal.new"]
query "enter"          -> ["input.send","terminal.new","shortcuts.open"]
query "zzz"            -> []

=== 4. malformed stored bindings: deny, fall back to defaults ===
truncated JSON   status=unreadable error=invalid edit=unreadable defaultStillBound=["Ctrl","+","Shift","+","N"] dispatch=handled
unknown field    status=unreadable error=invalid edit=unreadable defaultStillBound=["Ctrl","+","Shift","+","N"] dispatch=handled
future schema    status=unreadable error=future  edit=unreadable defaultStillBound=["Ctrl","+","Shift","+","N"] dispatch=handled
bad profile key  status=unreadable error=invalid edit=unreadable defaultStillBound=["Ctrl","+","Shift","+","N"] dispatch=handled
bad command id   status=unreadable error=invalid edit=unreadable defaultStillBound=["Ctrl","+","Shift","+","N"] dispatch=handled

=== 5. KeyRecorder with a DOM stand-in (no browser) ===
listeners while recording: {"document":["keydown","keyup"],"window":["blur"]}
modifier only          -> null
candidate after keydown-> {"code":"KeyM","modifiers":["control","shift"]}
captured               -> [{"code":"KeyM","modifiers":["control","shift"]}]
candidate after commit -> null
listeners after commit : {"document":[],"window":[]}
escape cancels         -> cancelled=1 candidate=null
listeners after cancel : {"document":[],"window":[]}

=== 5b. installKeyboard + dispatch with a DOM stand-in (no browser) ===
installed: ["doc:compositionstart","doc:focusin","doc:pointerdown","win:keydown","win:blur"]
Mod+Shift+N -> preventDefault=true runs=["session.new"]
unbound Mod+Z -> preventDefault=false (browser keeps it)
regionOf terminal/editable/page: terminal editable page
after dispose: []
```

Two findings came out of the run and were fixed in the same pass: `KeyRecorder` read modifier state from `event.control` instead of `event.ctrlKey`, so every recorded combination came back with no modifiers; and `isWebBindingAllowed`'s Linux branch left the platform with three bindable combinations.

Also verified: `node scripts/publint-all.js` reports `All good!` for `packages/client/shortcuts`. The two CSS files were added to the generated `packages/client/css-manifest/src/manifest.js` by running its generator (`node packages/client/css-manifest/scripts/generate-manifest.mjs`, which reads `git ls-files`), and the package is mounted by a new `shortcuts` row in `packages/bundle/web-app/cordis.patch.yml` plus its `package.json` dependency.

What this buys: one window-local keyboard layer features can register into, with discovery, rebinding, and a fail-safe restore. What it costs: a package that owns only its own `shortcuts.open` command until the features that own the rest register them, and a Web allow-list narrower than a native app's — a deliberate trade, since advertising a combination the browser eats is worse than not offering it.
