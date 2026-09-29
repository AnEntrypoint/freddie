# computer-use/ — computer-use capability group

Computer-use providers let models observe and operate a desktop. This group owns exclusive provider registration only — a provider implementation mounts separately and reserves the slot with `ctx.computerUse.register(name)`.

| Package | Role | ctx key |
|---|---|---|
| [`computer-use/`](computer-use/README.md) | Exclusive named provider registration | `ctx.computerUse` |

No provider is mounted yet — this ships the seam a future computer-use driver registers against. Each provider owns its own operations, tools, and platform requirements; freddie's stack carries no desktop application framework, so a provider that needs one is out of scope for this group rather than for the seam.
