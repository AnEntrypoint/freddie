# bundle/ — profile plugin bundles

Profile bundles: npm packages whose manifest declares `"freddie": { "bundle": { "patch": "./cordis.patch.yml" } }`, making them installable patch layers for `freddie --profile` compositions ([profile contract](../boot/app-boot/README.md#profiles)). A bundle's substance is its patch list; some also ship runtime glue plugins their patch mounts.

The manifest declaration, not this directory, defines Bundle identity. Domain packages can carry their own optional Profile layer; the [Codex and Claude Code subagent packages](../subagent/README.md) are directly installable examples.

| Package | Role | ctx key |
|---|---|---|
| [`base/`](base/README.md) | The shared freddie core every profile applies first | — (patch only) |
| [`web-app/`](web-app/README.md) | Browser surface: web patch layer + runtime glue plugin | mounts rows |
| [`headless/`](headless/README.md) | Direct one-shot task mode over base, with no Host or Web layer | mounts `headless-runner` |
| [`acp-app/`](acp-app/README.md) | ACP automation stdio over base: zero-option app command + the ACP bridge | mounts `acpStartup` |
| [`sdk-app/`](sdk-app/README.md) | SDK JSON-RPC stdio over base: zero-option app command + the SDK server | mounts `sdkStartup` |
| [`agent-team-profile/`](agent-team-profile/README.md) | Agent Teams over base, in every shipped profile template: Team service + Team-scoped tools, legacy global subagent delegation off | mounts `agentTeams` |
| [`dream-rsi/`](dream-rsi/README.md) | Grounded Dream-RSI context over base, in every shipped profile template: adds a directive only after gm records replay evidence | mounts `dream-rsi-context` |

In-box bundles resolve from the freddie installation; out-of-tree bundles install into a profile through `freddie plugin --profile <name> add <package>`.
