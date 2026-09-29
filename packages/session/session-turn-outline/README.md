# @freddie/freddie-session-turn-outline

Function plugin registering the `turnOutline` projection unit: a whole-session outline of every started turn — turn number, the turn's `turn/start` event seq, and bounded prompt and settled-response previews — served through the session-projection seam (registry snapshot, change feed, and every projection carrier: history tail page, `session/projection` push frames, session list rows). A history client can offer every turn of a session and page back to the exact seq that loads a selected turn without holding the complete event log.

## Fold semantics

- `turn/start` — not the prompt `user/message` — anchors every entry, because its seq is the load-through target for a jump: the agent loop logs `turn/start` before the turn's prompt and steps, so a window paged back through that seq contains the whole turn.
- `prompt` fills from the first `user/message` whose `source.kind` is `user`, and only while the newest entry's prompt is still empty — later human messages in the same turn (steering) keep the first preview, and injected context and tool results never leak into navigation.
- `response` cannot fill the same way (`turn/end` carries no text), so each text-bearing `assistant/message` overwrites a state draft and `turn/end` commits the survivor — the newest text, the loaded rail's `findLast` semantic.
- Both previews are the message's text blocks space-joined with collapsed whitespace, capped at 50 (prompt) and 120 (response) characters with a trailing ellipsis when clipped — one rail-card line and up to three. A single block is clipped to twice the budget before it is joined, so a multi-megabyte block is never concatenated or whitespace-normalized whole for a preview this short.
- A `turn/start` that does not advance the turn number is skipped, keeping the outline strictly increasing by turn; a retried boundary's previews then land on the standing entry.
- Uninteresting events return the same state reference, so the registry's `Object.is` gate keeps the change feed quiet; draft-only changes keep the `turns` array's identity, so a carrier comparing view values by reference can drop them too — the gate still fires on the state change, so a streaming turn emits a few value-identical frames before the response commits (the same characteristic `sessionStats` has).
- The wire value is the complete entry array (whole-value rule): consumers replace, never merge. A composed registry always serves the key, so clients read the value, never key presence.

## Composition

```yaml
- id: session-turn-outline
  name: '@freddie/freddie-session-turn-outline'
```

Injects `sessionProjections` — the plugin's whole purpose; in assemblies without the registry the fiber stays pending and nothing registers.

## Model Experience

None, as the plugin only computes a client-facing read model of already-logged session events and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the plugin never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **The wire value grows with the session** — every push carries the complete outline (whole-value rule), up to ~600 bytes per turn at full multibyte-script budgets and typically far less; splitting previews into an on-demand read is deferred until sessions with many thousands of turns need it.
- **The response previews only settled turns** — it commits at `turn/end`, so an open turn (or one whose end never logged) shows a prompt-only preview until the boundary lands.
- **A turn without eligible text keeps `''`** — images-only and command-only turns are navigable but labeled by number, and a turn whose steps emit no text gets no response preview.
- **The shipped mount has no reader yet** — `packages/bundle/base/cordis.patch.yml` mounts the unit, but no freddie client reads `turnOutline` today, so it adds one unread key to every history tail page and list row until one does; consumers treat an absent `turnOutline` key as capability absence, exactly as they do for every other projection unit.
