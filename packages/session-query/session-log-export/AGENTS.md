# AGENTS.md — session-log-export

## Rationale

- Web-only `/export` command: the browser plugin observes it and downloads a Session tree from the host endpoint owned by ApiProxy. The header action holds one body-mounted `freddie-modal` only while connected; detached factory elements may be discarded without a disconnect callback ([ownership rationale](../../../.agents/notes/implemented/bug-fix/2026-10-06-connected-session-export-modal-owner.md)). No runtime invariant: the command registry owns lifecycle pairing and ApiProxy owns ZIP integrity.
