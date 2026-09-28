# browser-use/ — browser-use capability group

Browser-use providers let models inspect and operate web pages. This group owns exclusive provider registration only — a provider implementation (Playwright, Chrome DevTools, or a native driver) mounts separately and reserves the slot with `ctx.browserUse.register(name)`.

| Package | Role | ctx key |
|---|---|---|
| [`browser-use/`](browser-use/README.md) | Exclusive named provider registration | `ctx.browserUse` |
| [`../experimental/browser-use-runtime/`](../experimental/browser-use-runtime/README.md) | Shared provider library: per-live-Agent resource ownership, serialized operations, cleanup on disposal, and `mountSessionMcp` discovery | — |
| [`../experimental/browser-use-chrome-devtools-mcp/`](../experimental/browser-use-chrome-devtools-mcp/README.md) | Experimental provider: per-Session Chromium through the pinned `chrome-devtools-mcp` server | `ctx.browserUse` |

The two experimental packages are private prototypes (see [`experimental/AGENTS.md`](../experimental/AGENTS.md)) and mount only when a composition names them explicitly; the registration seam itself ships in this group. The Chrome DevTools provider declares no dependency on its upstream server — it resolves the pinned entry at launch — so nothing third-party enters the tree at install time.

