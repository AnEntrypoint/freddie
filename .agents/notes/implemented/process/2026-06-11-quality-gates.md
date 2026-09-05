# Agent Note: Mechanical quality gates over prose guidelines

Status: implemented

The hook/CI symmetry in this record is superseded by [Fast local Git hooks](2026-07-22-fast-local-git-hooks.md); CI remains the exhaustive enforcement path. The TypeScript-strictness, coverage, and vitest-dependent gates this note originally described are gone: the workspace is buildless plain JavaScript and there is no automated test suite ([why](../architecture/2026-09-02-buildless-workspace-no-transformation-at-launch.md)).

## Problem

This codebase is developed primarily by coding agents. Agents follow enforced gates far more reliably than prose conventions, and "a lot of work" is not a cost argument when agents do the labor.

## Decision

Every mechanically checkable AGENTS.md promise that can still be checked without a build or test step gets a command that exits non-zero:

- [Oxlint](2026-07-29-oxlint-linter.md) with the @stylistic and SonarJS compatibility plugins, enforcing house style and file-local duplicated-logic checks; vendored code excluded.
- jscpd detects cross-file clones in package production source and repository scripts; narrow source-range exceptions document deliberately parallel implementations.
- knip (dead code/deps) and publint (package correctness).
- lefthook pre-commit applies project-free Oxlint validation and [safe fixes with a bounded retry](2026-08-09-oxlint-only-fix-workflow.md), and rejects staged whitespace.

Everything else — behavior correctness, published-entry-path regressions, model- and UI-visible changes — is verified live in the same change, per the root `AGENTS.md` verification-policy convention.

## Consequences

- Conventions survive agent turnover for what remains mechanically checkable; cheap commit-time defects fail locally.
- The gates themselves are code to maintain; config changes are reviewed like any change.
- There is no coverage gate, no execution-without-assertion failure mode to counterweight, and no mutation-testing proposal to pursue — that whole axis of enforcement is gone along with the test suite it gated.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
