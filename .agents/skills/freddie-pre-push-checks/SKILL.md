---
name: freddie-pre-push-checks
description: Use before pushing, force-pushing, marking ready for review, or claiming checks pass on a freddie branch, and immediately after gh stack sync publishes rewritten branches, to select the smallest tests and checks that cover the outgoing or just-published diff without reflexively running the full repository suite.
---

# FREDDIE Pre-Push Checks

Use this skill to run relevant local evidence once before a `freddie` push. The sole ordering exception is `gh stack sync`, which may publish a cascading rebase before the rewritten layers can be validated; validate them immediately afterward and do not merge until the evidence passes. Git hooks are intentionally narrow: `pre-commit` runs one check, staged whitespace (`git diff --cached --check`); there is no `pre-push` hook. The workspace has no automated test suite and no build step; verification is live execution against the real running system.

## Inspect the outgoing change

1. Confirm the checkout and branch.

```sh
git status --short --branch
git rev-parse --show-toplevel
```

2. Verify the live PR base or stack parent, fetch that ref, and inspect the complete scope against it.

```sh
pnpm --silent run change-scope --base <verified-base-ref>
```

The command never guesses or fetches a base. Supply the ref verified from current remote or stack state; use `--head <ref>` when inspecting a commit other than `HEAD`. Its versioned JSON records committed paths relative to the resolved merge base, while staged, unstaged, and untracked paths describe the current worktree. After merging a changed base, rerun the report, reassess which behavior the combined scope can affect, and rerun only checks invalidated by the merge.

## Select relevant evidence

There is no automated test suite and no universal local baseline beyond the whitespace hook. Every behavior change is verified live — boot the real composition or app, drive the actual change, and read the real output — same turn as the work. A diff's own claim about itself is not evidence.

- **Model-, editor-, CLI-, or terminal-visible output:** boot the real example or app that owns the output and drive it.
- **Package manifests, public exports, or the published file set:** run `pnpm run publint`, which validates each package's real relative imports against its own `package.json` `files` array.
- **Real provider or agent behavior:** run the relevant demo (`pnpm run demo:cordis`, `pnpm run demo:acp`, `pnpm freddie --profile headless "..."`) when credentials are available; never print secrets.

Do not manually repeat a passing check merely because commit or push follows.

## Full local rehearsal

There is no aggregate "run everything" command. Select checks from the current `package.json` script inventory that match the changed surface; do not invent a broader check that doesn't exist.

## Protect history-rewriting pushes

Rebase is allowed for standalone and stacked PR branches, including after review. Before a standalone history rewrite, fetch the current remote branch and record its exact OID; publish with `--force-with-lease=<branch>:<observed-oid>` so a concurrent update aborts the push. `gh stack push` and `gh stack sync` supply lease protection for their managed branches. Raw `--force` is never allowed.

After any rewritten push, fetch the live heads again and re-audit unresolved review threads, approvals, mergeability, and checks. Commit hashes and inline-comment anchors from before the rewrite are not current evidence.

### Post-sync validation

`gh stack sync` fetches, cascade-rebases, and pushes as one operation, so it cannot place local validation between rewrite and publication. Before running it, require a clean worktree and record the official stack order and exact remote heads. After it returns:

1. Re-query every branch head and the official GitHub stack order.
2. Inspect the changed scope of every rewritten layer against its live PR base.
3. Run the relevant evidence selected by this skill for each affected layer.
4. Keep every PR unmerged and report validation as pending until all selected checks pass.

If post-sync evidence fails, leave the lease-protected published heads in place, repair the failure, validate the repair, and publish the correction. Do not claim the sync made the stack ready merely because the command succeeded.

## Handle failures

If a relevant check fails before an ordinary push, stop and fix or explain the blocker. Do not push and hope CI differs. For the post-sync exception, block the merge and follow the repair procedure above.

If a failure looks environment-specific, prove it:

- Record the exact command, failing test, and platform-specific mismatch.
- Confirm the relevant non-platform evidence.
- Prefer fixing cross-platform nondeterminism when the check is required.
- Bypass a local hook only when the user explicitly asks or agrees, and report exactly what failed and why CI is expected to differ.

## Push procedure

For ordinary and standalone rebase pushes:

1. Run the selected relevant checks once.
2. Commit normally and inspect any files changed by the pre-commit fixer before continuing.
3. Push normally, or use the exact lease for an authorized rewritten branch.
4. Verify the remote ref matches local `HEAD`.

```sh
git rev-parse HEAD origin/$(git branch --show-current)
```

For GitHub PRs, inspect remote CI after the push:

```sh
gh pr checks
```

Report pending checks as pending. Inspect failures before attributing them to the branch or the environment.

When `gh pr checks` reports "no checks reported" and `/actions/runs?head_sha=<sha>` returns `total_count: 0`, read mergeability before suspecting the push or a dropped GitHub event:

```sh
gh pr view <number> --json mergeable,mergeStateStatus
```

GitHub creates no `pull_request` workflow runs while a PR is `CONFLICTING`/`DIRTY`, so the absent signal is the conflict, not infrastructure. Resolving the conflict is the only fix; empty commits, `--allow-empty` pushes, draft/ready toggles, and revert-and-restore bounces all leave `total_count` at zero and add junk history. Confirm the conflicting paths with `git merge-tree --write-tree HEAD origin/<base>` when the branch cannot be merged locally yet.

For `gh stack sync`, use the post-sync validation sequence instead of pretending the ordinary order was possible.
