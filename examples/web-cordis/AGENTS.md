# web-cordis

## Rationale

- `cordis.yml` is a patch overlay over the web profile (freddie-base plus the web-app bundle layers), not a tree: `freddie web --patch` applies it as one more sibling patch list at the same include level, so its patches reach every bundle row. A patch replaces the targeted row's whole `config`.
- Temporary plugin code can reach every injected live capability, so treat this deployment like shell access, not a security boundary.
- The `webserver` patch pins port 3081 to keep the demo off the default 3080.
- `cordis-host-runner` is not inserted here: the web-app bundle mounts it, and a second insert fails the boot with `duplicate loader entry id`.
