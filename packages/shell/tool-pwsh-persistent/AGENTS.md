## Rationale

- `src/index.js` `SCROLLBACK_PAGE_LINES`: one page is enough to find a just-emitted completion marker; the full scrollback is assembled only when a command settles or needs partial output.
- `src/index.js` `wrapCommand`: the wrapper stays on one physical line because PSReadLine renders the echoed input and a wrapped line would split the echo the extraction strips. The echoed END nonce can never fabricate completion because the status regex needs digits immediately after it and the echo continues with quote characters.
- `src/index.js` extraction: the PSReadLine echo carries the wrapper source (including both nonces) before the real markers; anchoring on the real markers excludes it, and stripping the wrapper covers the rare case where the real START scrolled out and extraction fell back to the echoed copy.
- `src/index.js` send loop: the shell status is re-observed before each send because a fast `exit` can settle the previous send while its exit event is still in flight, and the echoed wrapper can then carry a marker end without status digits.
- TODO in `src/index.js` `TRUNCATED_MESSAGE`: replace the file-search advice; arbitrary command output need not come from a searchable file.
- TODO in the timeout message: report a timeout only; the signal does not establish an OOM.
