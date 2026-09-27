# browser-use/ — browser-use capability group

Browser-use providers let models inspect and operate web pages. This group owns exclusive provider registration only — a provider implementation (Playwright, Chrome DevTools, or a native driver) mounts separately and reserves the slot with `ctx.browserUse.register(name)`.

| Package | Role | ctx key |
|---|---|---|
| [`browser-use/`](browser-use/README.md) | Exclusive named provider registration | `ctx.browserUse` |

No provider is mounted yet — this ships the seam a future browser-use driver registers against, matching how several other capability seams this session shipped before their first real consumer wired into them.

