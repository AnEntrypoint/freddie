# Agent Note: BrowserSkill activity in Freddie Web

Status: implemented

## Problem

Freddie Web draws a BrowserSkill call through the generic tool card. The row title of a completed call comes only from the generic result view's `title`; without one it falls back to the tool-category label `Tool call`. The provider's `presentCall` title never reached the Web, so a screenshot's output path was visible only inside the raw arguments and result JSON.

## Decision

`@freddie/freddie-experimental-browser-use-browserskill` gives every tool a `presentResult` that returns the same args-derived generic title as its `presentCall`. The title is `BrowserSkill <tool>: <action>`, with ` to <outPath>` appended when the call supplies `outPath`. The Web's existing result-title path shows it, so no client code, card kind, or session pane was added.

The projection is a pure function of the arguments, which keeps live streaming and session-log replay identical. Session ids, URLs, `fill` values, and browser labels are excluded from the title.

## Verification

A real `--profile web` boot with a patch overlay enabling `browser-use-browserskill`, a local OpenAI-compatible stub behind the DeepSeek adapter's `DEEPSEEK_BASE_URL`, and a stand-in `bsk` on `BSK_PATH`. The Web GUI rendered `BrowserSkill session start` and `BrowserSkill browser_inspect: screenshot to <path>`, and the same titles returned after a page reload, which replays the session log. A real BrowserSkill CLI, extension, and model key were not available, so the real CLI reply and browser behaviour remain unwitnessed.

## Alternatives considered

**A dedicated BrowserSkill session pane.** Rejected: the transcript already shows each owned call with its screenshot path, and a pane would add a session-scoped read model and its own ownership checks. Add one only if tool presentation cannot show the state.

**A `browserskill` capability seam (`browserskill-capability-seam`).** Not in the tree. The presenter belongs to the provider that already registers `ctx.browserUse`, so no new seam is needed.

**Deriving the screenshot path from the `bsk` reply in `presentationMeta`.** Rejected for now: the BrowserSkill 0.3.2 reply shape is external and not verifiable in the tree, and presenters must stay pure in arguments. The model-supplied `outPath` covers the case the title needs.

**Client knowledge of `browser_*` names in `ui-tool`.** Rejected: tool presentation ownership sits on the tool side ([client tool-presentation ownership](../architecture/2026-08-08-client-tool-presentation-ownership.md)).

## Consequences

- A completed successful BrowserSkill row names the action and any output path. Error results keep the client's default title, because the Web applies a result title only to successful rows.
- Without `outPath`, the path BrowserSkill chose appears only in the result text.
- Presentation has no token or KV-cache effect.
