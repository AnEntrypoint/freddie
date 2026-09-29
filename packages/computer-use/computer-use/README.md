# freddie-computer-use

Exclusive named registration for the computer-use capability: exactly one provider (a Cua Driver MCP backend, a native desktop driver, an OS-automation backend) may hold `ctx.computerUse` at a time, so a deployment can swap backends without any consumer caring which one is mounted.

## Surface

```js
import { Service } from '@freddie/cordis'
import { ComputerUseProviderName } from '@freddie/freddie-computer-use/brand'

class MyDesktopDriver extends Service {
  constructor(ctx) {
    super(ctx, 'myDesktopDriver')
    this.dispose = ctx.computerUse.register(ComputerUseProviderName('my-driver'))
  }
}
```

`register(name)` throws (naming the currently held provider) when a slot is already taken — a second driver mounted by mistake fails loudly at registration time rather than silently racing the first. `ctx.computerUse.providerName` reads the current holder, or `undefined` when the slot is free; disposal is a normal Cordis effect, so unloading the registering plugin releases the slot automatically, and a stale disposer called again after a new provider has already taken the slot is a no-op (Cordis effect disposers are idempotent) — it never clears someone else's registration.

Mount the registry beside the chosen provider; it has no configuration:

```yaml
- name: '@freddie/freddie-computer-use'
```

This package adds no model-visible tools and does not coordinate concurrent Sessions.

## Known Limitations and Deferred Work

- **No provider ships yet.** This is the exclusivity seam only — dsh's own driver implementations (Cua Driver MCP, Cua Driver native) live under its `experimental/` group and were not ported this session: each is its own substantial desktop-automation surface deserving independent review, and freddie's stack carries no desktop application framework (Electron excluded), so nothing here can drive a desktop on its own.
- **Shared desktop** — concurrent Sessions and separate processes can operate the same desktop; callers coordinate whole computer-use workflows.
- **Provider selection** — composition selects the provider; the model cannot switch registered drivers at runtime.
