## Rationale

Non-obvious reasons behind code in `framework/cordis/src`. Divergences from upstream live in `framework/README.md` (Divergence log), not here.

- `fiber.js` `Fiber` dispose effect: `this.inertia` is not expected to reject, because `_reload` and `_unload` log their own errors through `ctx.logger.error`. A rejection therefore means the logger itself failed. It is deliberately left to propagate (process-level crash) instead of being retried through the failing logger.
- `fiber.js` async-iterator effect branch: `await Promise.resolve()` runs before `info.error = new Error()` so the recorded stack is an async one, which `utils.js` `handleError` then matches against the rejection stack.
- `reflect.js` `provide()` disposer: deletes the impl, notifies and awaits dependents, and only then deletes `ctx.fiber.store[name]`. The provider must keep reading its own service while dependents tear down.
- `registry.js` `resolve()`: the `try/catch` is intentional. Reading `plugin.apply` can throw (getter), and the plugin is then simply not resolvable.
- `service.js` `Symbol.hasInstance`: `constructor` may be a proxy, hence the walk through `constructor.prototype?.constructor` instead of a single `instanceof` step.
- `utils.js` `isConstructor`: cannot use `func.prototype.constructor !== func`, since proxied functions such as `mock.fn()` fail it. The `AsyncGeneratorFunction !== Function` guard covers environments where `AsyncGeneratorFunction` is polyfilled to `Function`.
- `utils.js` `createTraceable`: services with `noShadow` are identity-aware (the logger derives its name from the origin fiber via `ctx[symbols.shadow]`), so they keep the shadow ctx. All other services strip it, so their side effects bind to the caller rather than the origin.
- Known gap: `fiber.js` `resolveConfig` supports only synchronous Standard Schema validators; a validator returning a promise throws `TypeError: Async config validation is not supported`.
