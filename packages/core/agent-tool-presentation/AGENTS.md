# freddie-agent-tool-presentation

## Rationale

- `src/index.js` `apply`: `ctx.tools.presentAs` is itself the effect (it registers through the calling context and returns that exact disposer), so no second wrapper owns the declaration.
- `src/index.js` `apply`: for `code`/`both`, waiting on `codeRuntime` is the loud failure path; an entry still pending on it is reported by `freddie-agent-presets` as an inactive row naming this id.
