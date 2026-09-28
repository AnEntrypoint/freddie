# freddie-browser-use

Exclusive named registration for the browser-use capability: exactly one provider (a Playwright driver, a Chrome DevTools driver, a native automation backend) may hold `ctx.browserUse` at a time, so a deployment can swap backends without any consumer caring which one is mounted.

## Surface

```js
import { Service } from '@freddie/cordis'
import { BrowserUseProviderName } from '@freddie/freddie-browser-use/brand'

class MyBrowserDriver extends Service {
  constructor(ctx) {
    super(ctx, 'myBrowserDriver')
    this.dispose = ctx.browserUse.register(BrowserUseProviderName('my-driver'))
  }
}
```

`register(name)` throws (naming the currently held provider) when a slot is already taken — a second driver mounted by mistake fails loudly at registration time rather than silently racing the first. `ctx.browserUse.providerName` reads the current holder, or `undefined` when the slot is free; disposal is a normal Cordis effect, so unloading the registering plugin releases the slot automatically, and a stale disposer called again after a new provider has already taken the slot is a no-op (Cordis effect disposers are idempotent) — it never clears someone else's registration.

## Known Limitations and Deferred Work

- **No provider ships in this group.** Two experimental providers implement this seam under [`experimental/`](../../experimental/README.md) — a shared resource-ownership runtime and a Chrome DevTools MCP driver — and were not promoted to release packages this session (they are private, mount only when a composition names them explicitly, and the driver resolves a pinned third-party server entry at launch rather than declaring a dependency).
