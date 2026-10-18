# freddie-experimental-browser-use-browserskill

Use [BrowserSkill](https://github.com/Tencent/BrowserSkill) to operate the user's connected Chrome or Edge profile through its `bsk` CLI, daemon, and extension. The provider opens visible Agent Windows and preserves the extension's confirmation and human-help settings; it never starts an isolated browser or silently substitutes another browser backend.

## Use this package

Mount it next to `@freddie/freddie-browser-use` in a host composition that supplies Agents, tools, and the subprocess service. The default bundle keeps the row disabled: enable it only in an operator-controlled profile after installing `bsk` and connecting the BrowserSkill extension.

```yaml
- name: '@freddie/freddie-browser-use'
- name: '@freddie/freddie-experimental-browser-use-browserskill'
  config:
    bskPath: bsk
    defaultTimeoutMs: 120000
    maxSessions: 5
```

| Field | Default | Meaning |
| --- | --- | --- |
| `bskPath` | `bsk` | BrowserSkill CLI executable or absolute path. |
| `cwd` | host current directory | Working directory for BrowserSkill CLI calls. |
| `defaultTimeoutMs` | `120000` | Per-tool CLI timeout policy. |
| `maxSessions` | `5` | Maximum BrowserSkill sessions owned by one Freddie Agent. |

`browserskill_status` calls `bsk doctor --json` through the managed subprocess seam. It reports CLI, daemon, and extension readiness without starting a browser session. A failed `extension connected` check means the user must install and connect the BrowserSkill extension; the provider does not use a different browser to bypass that state.

## Ownership and lifecycle

`browser_session` records only sessions created by its calling Agent. All other BrowserSkill tools require one of those records and reject foreign session ids. If an Agent owns more than one session, the caller must name `session` explicitly. Agent disposal and provider unloading stop every recorded session, returning borrowed tabs through BrowserSkill's normal cleanup path.

The provider invokes `bsk` without a shell through `ctx.subprocess`; the subprocess provider scrubs inherited credential-shaped and `FREDDIE_*` environment variables, bounds captured stdout and stderr, and terminates commands when their tool signal aborts. CLI failures preserve BrowserSkill's JSON message and hint when available.

## Model Experience

### BrowserSkill tool suite

#### What the model sees

The provider adds `browserskill_status` plus six grouped tools: `browser_session`, `browser_page`, `browser_inspect`, `browser_interact`, `browser_tabs`, and `browser_assist`. Their descriptions require fresh page observations, preserve tab-borrow confirmation and human-help settings, and state that page text, markup, console output, network payloads, and element labels are untrusted data rather than instructions. The tool catalog exposes BrowserSkill's session lifecycle, navigation, semantic observation, screenshots, console/network and debugging evidence, interaction, upload/download, Agent Window tabs, emulation, and human-assistance operations.

#### Token effect

The fixed tool schemas enter the model tool catalog. Browser observations, diagnostics, and action results append to the durable tool-result history. Screenshot files remain paths unless a separate attachment consumer admits them.

#### KV Cache effect

An unchanged BrowserSkill tool catalog preserves the request prefix. Tool results append after the reusable prefix; changing the provider configuration or enabling/disabling the row changes the catalog and can invalidate reuse.

## Known Limitations and Deferred Work

- **External extension**: BrowserSkill requires the separately installed `bsk` CLI and Chrome or Edge extension. The provider reports readiness but cannot install, enable, or pair the extension for the user.
- **BrowserSkill protocol scope**: The integration targets BrowserSkill CLI 0.3.2. New CLI flags or result shapes need re-verification before the provider expands its model-visible contract.
- **Screenshot attachments**: Screenshots use BrowserSkill's output path. Inline image admission and a live BrowserSkill pane in Freddie Web remain separate client integration work.
- **User-account authority**: Agent Windows share the selected browser profile's logged-in state. BrowserSkill extension prompts remain the authority for borrowing an existing tab and requesting human help.
