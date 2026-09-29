# AGENTS.md — session-log-export

## Rationale

- Web-only `/export` command: the browser plugin observes it and downloads a Session tree from the host endpoint owned by ApiProxy. The header action is a class-based custom element holding one `freddie-modal` across renders (`renderModal(el, props)`); a bare `<Modal>` call per render would orphan modals. No runtime invariant: the command registry owns lifecycle pairing and ApiProxy owns ZIP integrity.
