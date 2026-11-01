# 03-eliminate: comment-sweep-lint-directives

session: mcp-codemode-3535970-1793542718115-1-14

## cls-u1-first-party-directive-keywords

expected (from the row's Pre contract, written before the run): 59 lint-suppression comments across 38 first-party files.
observed: 0 directives in first-party JS, for every keyword family tried (eslint, biome, oxlint, @ts-, prettier, istanbul, c8, v8, jshint, stylelint, lint, ignore, `//`, `/*`), comments mode, `exclude: **/vendor-modules/**`.
- Scan counts: `files_scanned` 1941 (excluded scope) vs 2318 (unfiltered).
- Positive control, same instrument, unfiltered: `//` comment_count 428; `eslint` directive_count 21. The instrument sees comments.
- Only first-party comment match for the keyword `ignore`: `native/landlock-run/.gitignore:2` (a `#` comment, not a directive).
- Dispatch ids: 1793543317748-442-60c1f07e261a07fd (eslint), 1793543318511-443-343151518ebc966d (biome), 1793543319352-446-7e7874216e4a2f53 (oxlint), 1793543320338-449-f605445db7c5caa1 (@ts-), 1793543321337-453-c51e58c4d73e44db (prettier), 1793543321976-455-5d530ee59287fe7a (istanbul), 1793543322571-458-1d6ca6efde7e4ccc (c8), 1793543323256-459-82ae740c53bf0b3c (v8), 1793543323894-461-c8fd452574a46712 (jshint), 1793543324521-463-f09ec0cc9de32ca6 (stylelint), 1793543325106-464-2b220b0563fdb961 (lint), 1793543325803-466-1693ae71ea20782 (ignore), 1793543326390-468-346a14803577f550 (eslint-disable-next-line), 1793543326943-471-5f5558e9ea6171f (/*), 1793543327507-472-889cb06375ac29a5 (//).- Result: observed 0 does not match the row's 59. The Pre premise is refuted. Known: first-party JS carries no lint-suppression directives.

Note on the earlier comments-mode run: `eslint-disable` unfiltered returned 20 directives, all under `packages/client/vendor-modules/vendor/` (dispatch 1793542980256-94-421409dd85e99a34).

## cls-u2-vendor-payload-editable

expected (from `packages/client/vendor-modules/AGENTS.md:13`): existing versioned vendor files reject content drift; a version change is the route.
observed: `packages/client/vendor-modules/scripts/generate-vendor.mjs:213` throws `generate-vendor: content drift under an existing version directory ... bump the package version instead of overwriting an immutable URL's contents`. Dispatch 1793543352716-545-b7683ace761b168d (literal `immutable`) and 1793543353331-550-671f9cccd1ec708 (literal `drift`).
- Result: matches. Vendored directives (`eslint-disable` 20, `@ts-expect-error` 49, `@ts-ignore` 10, `c8 ignore` 10, `istanbul ignore` 2, `biome-ignore` 1, `jshint` 1, literal counts from orient) are not editable under this row. They are immutable upstream payloads; changing them requires a version bump, which is outside this row.

## cls-u3-schedule-v8-claim-sole

expected (from the row's Post contract and the schedule AGENTS line): if `packages/schedule/schedule/AGENTS.md:5` were true, `src/domain.js` would carry `v8 ignore` text.
observed: `packages/schedule/schedule/src/domain.js` contains no `v8` text (path-scoped `v8` scan over `packages/schedule`, dispatch 1793543201362-253-4695a0ead63d775: 1 match, the AGENTS line). The only tree match for `v8 ignore`, `coverage directive` and `src/domain.js` referring to directives is `packages/schedule/schedule/AGENTS.md:5` (dispatches 1793543360035-560-71276fb7c71820a9 for `coverage directive`, 1793543366896-563-a3176a7080403683 for `src/domain.js` in packages/schedule).
- Other `src/domain.js` references are shape citations and do not mention directives: `docs/persistence-catalog.md:605`, `docs/subsystems/schedule.md:3` (dispatch 1793543368441-570-906648756e89fda5).
- Result: the AGENTS line is false. Removing it orphans no other reference.

## Summary

All three unknowns are known. No new unknown was revealed. Standing facts for gm-edit:
- First-party JS lint directives: 0. Row Pre (59 across 38) is stale.
- Only actionable edit: `packages/schedule/schedule/AGENTS.md:5` (false directive claim). The row names no file, so re-scope the row with `prd-add` under the same id before editing.
- Vendored directives stay as they are.
