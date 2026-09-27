# freddie-tool-present

Model-facing `present` tool: explicitly declares one or more existing files as final deliverables for the user, appending a `deliverables/presented` session event. This complements `@freddie/freddie-client-ui-deliverables`'s existing automatic inference (which surfaces a file only when a tracked mutation tool — `edit`/write, `str_replace_editor` — touched it in the current turn): a file a `bash` command produced (a script-generated PDF, spreadsheet, or slide deck) or an already-existing file the model wants to hand off has no `locations` for that inference to read. `present` gives the model a way to say "this one, on purpose" regardless of how the file came to exist.

## Surface

```
present({ files: [{ path: "report.pdf", description: "Q3 summary" }] })
```

Requires an open turn (a `present` call is meaningless once the turn that produced its context has ended) and the session's workspace `cwd` (relative paths resolve against it). Each path must exist and be a regular file — `lstat` first refuses a non-regular-file at the request path itself (a symlink to a directory, say), then `resolve`/`stat` confirm the resolved target exists and is a regular file, before anything is recorded. At most `maxFiles` (default 8) per call, recommended 1–2, hard cap 4 enforced by the description alone (the enforced ceiling is `maxFiles`). On success, appends `deliverables/presented: { turn, callId, files }` to the session — recorded only after the tool call itself settles without error (`ctx.on('tools/result', ...)`), so a call that errors mid-validation leaves no partial delivery record.

## Model Experience

The event is model-visible session history: a later turn (or a resumed session) can see what was explicitly presented and to which turn. The tool's own result renders as plain "Presented `<path>`" lines per file.

#### KV Cache effect

None; the tool result is ordinary turn output, not a request-header-varying value.

## Known Limitations and Deferred Work

- **No turn-tail chip integration yet.** `@freddie/freddie-client-ui-deliverables`'s produced-files row currently reads only from mutation tools' `locations`, not from `deliverables/presented` events — a `present` call today renders as an ordinary tool-call row in the transcript, not as a produced-file chip. Wiring the two together is additive client-side work, not required for the tool to function, and is left for a follow-up.
- **Turn-open detection reads `session.events` directly** (the last `turn/start`/`turn/end` pair) rather than a registered `sessionProjections` unit — freddie has no `turnBoundary` projection unit the way the upstream project this was ported from does; this matches how `@freddie/freddie-agent-loop` itself derives `lastTurn` internally, so it is not a new pattern, just not yet factored into a reusable projection.
