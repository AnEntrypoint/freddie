## Rationale

- `src/index.js` `SCROLLBACK_PAGE_LINES`: one page is enough to find a just-emitted completion marker; the full scrollback is assembled only when a command settles or needs partial output.
- `src/index.js` `wrapCommand`: the wrapper stays on one physical line because an interactive bash prints PS2 for embedded newlines before executing the buffer, which would leak terminal prompts and marker source text into the model-facing result.
- `src/index.js` `stty -echo` setup: echo suppression only; the prompt stays the backend's own so its prompt-based readiness detection keeps working.
- `src/index.js` send loop: the shell status is re-observed before each send because a fast `exit` can settle the previous send while its exit event is still in flight. When the shell reads stdin again (its prompt or a foreground child) without printing the end marker (for example `exec`, an interrupt, an interactive child), the captured output is returned instead of spinning until the command deadline.
- TODO in `src/index.js` `TRUNCATED_MESSAGE`: replace the file-search advice; arbitrary command output need not come from a searchable file.
- TODO in the timeout message: report a timeout only; the signal does not establish an OOM.
