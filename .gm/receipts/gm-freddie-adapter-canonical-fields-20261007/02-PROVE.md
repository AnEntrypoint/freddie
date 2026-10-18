# PROVE
Precondition: daemon accepted_fields via gm.describe. git_log: limit, count, rev, range, ref, path, paths, files. git_show: rev, ref, sha, commit, stat, path, paths, files.
Invariant: every field the registered schema exposes is in accepted_fields.
Run: node loader on packages/gm/tool-gm/src/verbs.js buildGmTools({}) -> gm_git_log {limit: number}, gm_git_show {rev: string}. Both subset of accepted_fields. Invariant holds.
Postcondition: no schema change required.
