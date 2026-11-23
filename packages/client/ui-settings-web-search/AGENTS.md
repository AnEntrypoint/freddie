# client-ui-settings-web-search

## Rationale

- `src/client/web-search-card-controller.js`: the form model is the Plugins section's `CardForm`, imported through `@freddie/freddie-client-ui-settings-plugins/client`. The key is a write-only control: its literal never rides a response, so the card learns only whether one is configured and writes through the credentials domain; it is staged with the rest so one save covers the card. A blank key writes nothing (keeps the stored key) and reports no override or invalidity. Save reads the outcome back from the section; a save that did not land keeps its drafts.
- Endpoint field admits only absolute `http(s)` URLs (relative paths and `file:`/`data:` are refused client-side); the host itself is the operator's choice and only the Host judges trust. Budget is a safe integer at or above the schema minimum.
- `src/client/web-search-card-controller.js`: the key reference falls back to a default when the section names none; a save that renames the reference moves the addressed key and re-reads; pushed invalidations re-read presence/writability/source (never a value); the key literal is never mirrored, logged or read back.
- `src/client/index.js`: the section is declared by the search provider that owns the `web-search-deepseek` namespace, so a deployment without it renders no card; activation order relative to ui-settings-plugins (which declares `settings.plugin.item`) is unconstrained, hence `slots.inject()`.
- `src/client/locales.js`: key copy never names a value and never promises one was stored, only that one is configured.
- The card's stylesheet and class map are `settings-card.css` and `settingsCardCss` in `ui-settings-plugins`, shared with the subagent card: the build runs no CSS Modules pass over client sources, so the map is hand-maintained beside its stylesheet, and `test/settings-card.js` checks that each class is styled.
- `src/index.js`: empty apply exists only for a Loader row; the namespace is registered by the search provider.
