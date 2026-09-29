# freddie-experimental-browser-use-runtime

Shared library for the experimental browser providers: it gives each provider per-live-Agent resource ownership, serialized operations, cleanup on disposal, and MCP discovery inside `agent/created`. This public experimental library is a dependency of the browser providers. It has no plugin entry or mount configuration. The [browser-use service](../../browser-use/browser-use/README.md) remains independent of the library.

## Use this package

### `SessionResources` — native providers

Construct `SessionResources` from the package root, supplying resource acquisition and cleanup callbacks. Calls pass the exact live Agent to `run()`; stale owners and a second owner of an exclusive attachment fail before acquisition. Canceling an acquisition wait leaves initialization available to other callers in the same Session; Session disposal aborts and awaits that initialization. Providers keep their registration until `dispose()` finishes.

```js
import { SessionResources } from '@freddie/freddie-experimental-browser-use-runtime'

const resources = new SessionResources(ctx, {
  label: 'my-driver',
  exclusive: false,
  async open(agent, signal) {
    const browser = await launchBrowser(agent, signal)
    return { value: browser, close: () => browser.close() }
  },
})

const page = await resources.run(agent, signal, async (browser, combined) => browser.openPage(combined))
await resources.dispose()
```

- `available(agent)` — admission check that neither reserves nor acquires.
- `get(agent, signal?)` — the owner's resource, acquiring it once.
- `run(agent, signal, operation)` — one operation queued behind every earlier operation for the same Agent.
- `dispose()` — shared quiescent teardown; a failed close retains its entry and rejects disposal.

### `mountSessionMcp` — MCP providers

MCP providers use `mountSessionMcp` from `@freddie/freddie-experimental-browser-use-runtime/mcp`, supplying their fixed server name, executable, arguments, and ownership policy. The helper starts one scoped client inside each future Agent's `agent/created` event and holds that Agent in a maintenance phase until the startup settles, so the first model request already carries the complete tool catalog. A successful client remains owned by that Session across turns. An optional `excludeAgent(agent)` predicate keeps an Agent out entirely: it gets no server, no browser tools, and no attachment slot.

A busy attachment skips startup permanently for that live activation while its other work continues. Releasing the attachment does not retry skipped activations; a newly created or resumed Agent can acquire it. Reconnection is disabled. Loading or reloading a provider applies only to future Agent activations.

Browser tools and resource requests targeting this server use the same queue and require the calling Session's own connection. Other MCP servers remain usable. Inherited server instructions are omitted without ownership; the shared resource-server inventory is scope-derived, so it names only servers this Agent's own scope registered.

## Understand the implementation

The [resource manager](src/index.js) keys ownership by live Agent identity and joins operation cancellation with owner disposal. Each resource has one acquisition promise and one operation queue. Failed acquisition releases its reservation only after the provider callback rolls back acquired resources.

Disposed-cause cancellation starts resource cleanup before the owning scope waits for idle. Cleanup closes resources before waiting for running operations, allowing connection teardown to interrupt upstream APIs without abort support. A failed close rejects disposal and retains ownership. Agent-scoped cleanup prevents a resumed Session with the same durable id from inheriting a previous browser.

The [MCP helper](src/mcp.js) starts within `agent/created` and retains the provider registration through resource cleanup. It uses the [MCP client](../../mcp/mcp-client/README.md) for transport, schema discovery, result conversion, and durable image admission, and [freddie-scope](../../core/scope/README.md) for the per-Agent connection scope.

**freddie divergence (from the upstream seam this bridges):** freddie's `agent/created` carries only `{ agent }` and its emitter does not await listener promises, so a provider cannot reject creation there. The helper therefore records each Agent's startup as `pending`, `ready`, `blocked`, or `failed`, and holds the Agent with `runMaintenance` until a `pending` startup settles. Prompt assembly snapshots the tool catalog before any `system-prompt/assemble` listener runs, so awaiting inside that waterfall would be too late; the maintenance hold keeps a waking message in the inbox instead and releases it behind the settled startup. A failed startup is logged and leaves that activation with no browser tools; it is never silently presented as a working catalog.

## Model Experience

Indirectly, through provider-owned browser tools, whose catalogs the MCP helper discovers before the Agent's first turn; providers and the MCP client own descriptions, schemas, results, and image behavior.

#### KV Cache effect

The library adds no prompt text. Discovered tool schemas and provider guidance determine request-prefix changes; ordinary browser resource reuse does not alter those schemas.

## Known Limitations and Deferred Work

Providers remain responsible for the browser operations they supply.

- **MCP activation** — providers do not adopt existing live Agents; a busy attachment is not retried within that activation.
- **Discovery timing** — freddie's unawaited `agent/created` means the catalog is guaranteed before the first turn, not at Agent registration; `whenIdle()` waits for it. An Agent that is already running when it is announced cannot be held, so its first request may precede the catalog.
- **Attachment scope** — exclusive ownership applies to one resource manager, not separate providers, processes, or external browser clients.
- **Cancellation** — abort signals and connection closure cannot undo browser actions already delivered. An upstream operation that ignores both can delay cleanup.
- **Recovery** — a failed close retains ownership; this manager does not retry disposal or restore browser state from the Session log.
- **Shared host runtimes** — a profile installs this package beside the freddie installation, so `@freddie/freddie-scope` and `@freddie/freddie-mcp-client` stay peer dependencies. A dependency edge ships a second `freddie-scope` copy whose scope tags host registries cannot read.
