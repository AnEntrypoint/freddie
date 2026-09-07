# Agent Note: Quote `!!js` YAML scalars that contain a ternary

Status: implemented

## Problem

`@freddie/cordis-plugin-include` parses `cordis.yml` / `cordis.patch.yml` with js-yaml's JSON schema plus a `!!js` scalar tag. An unquoted `!!js` value is still YAML: `?` starts a mapping key. A JavaScript ternary inside that scalar (`process.platform === 'win32' ? ';' : ':'`) therefore throws `YAMLException: bad indentation of a mapping entry` at Include parse, which aborts web boot before any plugin `apply`. `packages/bundle/base/cordis.patch.yml` `session-persistence-jsonl.config.extraRoots` hit this; the same file's `approval.config.policy` ternary was already a quoted scalar.

## Decision

A `!!js` scalar that contains `?` / `:` as JavaScript (ternary, or any other YAML flow indicator the expression needs) is a quoted YAML string. The quotes are YAML quoting of the expression text; Loader still evaluates `__jsExpr`. Unquoted `!!js` remains valid when the expression has no YAML-conflicting characters (`process.cwd()`, `process.platform === 'win32'`). Do not wrap the expression in extra JavaScript string quotes beyond what YAML needs.

## Alternatives considered

**Stop using ternaries in `!!js` and split on platform in plugin code.** Rejected: the extra-roots separator is deployment config, not plugin logic, and the same file already quotes a ternary for `approval.policy`.

**Switch Include off js-yaml JSON schema so `?` is not special.** Rejected: that dialect is shared with `--dump-config` and every other entry list; changing it would re-parse every existing unquoted `!!js` line.

**Leave extraRoots unquoted and catch YAMLException at boot.** Rejected: a parse failure is not a runtime config error the user can override; quoting the scalar removes the crash.

## Consequences

Patch authors who add a `!!js` ternary must quote the scalar. An unquoted ternary still fails loud at Include parse, which is the correct failure for a dialect violation. Quoted `!!js` values already in this file (`approval.policy`, `extraRoots`) are the pattern to copy.

## Verification

`node` imported `entryListSchema` from `framework/include/src/index.js` and `yaml.loadAll`'d both forms of `packages/bundle/base/cordis.patch.yml` this session: quoted extraRoots parsed to `{__jsExpr: "(process.env.FREDDIE_EXTRA_SESSION_ROOTS ?? '').split(...)"}`; the identical unquoted line threw `YAMLException: bad indentation of a mapping entry (159:120)`.
