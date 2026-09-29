# client-ui-settings-plugin-inventory

## Rationale

- Scope: the switch lives on this tab rather than in a new package. The tab already owns the per-plugin card, the inventory read, and the `settings.plugins.tab` slot; a second package would need the same cards, and the section that hosts the tab (`ui-settings-plugins`) only declares the tab strip.
- `createPluginManagerPort` (`src/client/plugin-manager-port.js`): every call resolves to `ok`, `forbidden`, `refused` or `failed`. The component renders states and never sees a transport string. `forbidden` is matched on `HTTP 403` in an `internal` failure because the Remote carrier folds a non-2xx status into that message and nothing typed reaches the caller.
- `describe` is read with `list` and after every switch: the locks are the Host's verdict on each entry and change when the mounted graph does. A `describe` that fails leaves every switch inert rather than assuming any entry is free.
- Non-optimistic: `aria-checked` is always the Host's last reported enablement. A card stays busy until the inventory has been re-read, so a failure or a refusal is drawn over the real state, not a guess to be rolled back.
- `#pendingSwitches`: overlapping switches each refresh, and only the newest refresh is applied (`#fetchToken`). Every busy card is held until the last switch has settled, so a card cannot look idle while showing a state an older refresh produced.
- `aria-disabled` instead of `disabled` on an inert switch: the control stays focusable so its reason, linked with `aria-describedby`, is read by keyboard and screen-reader users.
- A deployment whose `describe` answers `unavailable` still shows the list, with every switch inert and a reason, instead of hiding the controls.

- `plugin-manager-port.js`: every `pluginManager` call resolves to an outcome and never throws. `ok` carries the value; `forbidden` is the connection's 403 loopback pin (Host allows plugin switching from its own machine only); `refused` is the Host's typed answer with `code` and, for a locked entry, `lock`; `failed` is anything else (carrier failure, withdrawn namespace, codec mismatch).
- Contributes a lazy tab to `settings.plugins.tab`; the element is registered as `freddie-plugin-inventory-settings-tab` via `webjsxSlot` at the register call site in `index.js`. Module specifiers are compacted without guessing whether a Loader id was generated.
- `invariant.js`: no runtime invariant; state is read from the Host on every load.
