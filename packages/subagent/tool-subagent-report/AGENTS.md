## Rationale

- `src/index.js` `inject`: the contribution registers only through `childCtx.tools` and `childCtx.systemPrompt`, but declaring both services makes Loader ordering fail at load instead of at the next child materialization.
- `src/index.js` report execute: scope-local resolution guarantees an Agent; the service still verifies its exact live Activation identity at the authority boundary.
- `src/index.js` `apply`: `Config()` applies the schema default at runtime, but the Schemastery return type keeps the input's optional shape, so the resolved shape is asserted.
