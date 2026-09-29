# client-ui-settings-models

## Rationale

- `src/client/index.js`: the settingsScope injection makes ui-settings activate first and remote dispatch preserves listener order, so its `settings/document-updated` listener starts the mirror refresh before this store joins that refresh.
- `src/client/OnboardingModal.js`: Modal's one-shot factory appends a NEW `freddie-modal` to `document.body` per call and nothing removes the previous one; the step re-renders on every store change, so the modal is cached in a module-level singleton (`cachedModalEl`, size-1 like `DetailsPanel.js`'s `cachedArgsBlock`) and re-rendered in place. Onboarding shows at most one modal at a time.
- `src/client/OnboardingModal.js`: the application root is set inert while the step renders, and the component returns `null`; returning the body-portaled element would let the parent renderer move it under `#root`, making the dialog's own controls inert too.
- `src/client/ProviderEditor.js` credential retry: a settings success advances both retry baselines immediately. Keeping the derived fields in the draft prevents a pushed namespace refresh from turning them into deletions when the following credential write is retried.
- `src/client/ProviderEditor.js` string fields: whitespace-only input is cleared, not stored; `stringAt` already reports it absent, so otherwise the field renders empty while the draft carries the spaces into `settings.yaml`, where both adapters would accept them as a real value.
- `src/client/ProviderEditor.js` API key input: submit validity is updated on `input` because `change` fires only after blur, which loses the first click on Save.
- `src/client/DeepSeekModelsEditor.js`: capacity parsing snaps near-integers (`2.3 * 1e6` lands a few ULPs high in binary floating point); row error keys embed the row index, so `remove` re-keys around the dropped row and reset clears them all.
- `src/client/ModelsSection.js`: the post-apply notice is keyed by route id (the one thing an apply cannot change) and announced only after the refreshed directory is in the snapshot, because an apply can rename the route and the target captured at card open carries the old name; a row the same apply removed keeps the captured identity.
- `src/client/ModelsSection.js`: only the adapter can tell a hand-declared route from a shipped one it also has a stored profile for, so the custom tag follows its answer and stays off when it gives none.

## CSS rationale

- `ModelsSection.css`: every color resolves through a `--freddie-alias-*` token; bare `--border` / `--surface` / `--text-*` names (and `--freddie-alias-border-subtle`, `-text-tertiary`, `-text-primary`) are undefined in this app and would render their light-mode fallback literals under the dark theme. The app has no global border-box reset, so controls set `box-sizing` themselves or the outlined variants stand 2px taller than the filled ones beside them. The catalog is a table whose caption strip is hidden from assistive tech because each field already carries an indexed `aria-label`; data-URI SVGs cannot resolve CSS variables, so the select chevron uses the caption gray `#81858C` shared by both themes; the native disclosure marker is replaced by a rotating chevron because the engine triangle differs and cannot take the label color.
