# Agent Note: Composer ref key no longer written as an attribute

Status: implemented

## Problem

Every composer keystroke produced 37 DOM mutation records, and 23 of them were no-op writes of a `ref` attribute (old value equal to new value). `updateAttributesCore` in `framework/webjsx/src/attributes.js` skipped `children`, `key`, `dangerouslySetInnerHTML` and `nodes` in both its loops, so `ref` fell through to `updatePropOrAttr`. That function is not a DOM property, so it wrote `String(callback)` as an HTML attribute on the composer textarea, on `FREDDIE-SLOT-OUTLET` elements and on DIVs. webjsx already consumes `ref` through `assignRef` in `applyDiff.js` and `createDOMElement.js`, so the attribute write had no reader.

## Decision

`ref` is excluded in both attribute loops of `updateAttributesCore` (commit f58a267d). Divergence entry 22 in `framework/README.md` records the exclusion next to the attribute-serialization rule it refines.

The row prd-mw0ikvox01c8 still read "open, not started" on 2026-11-03, but the change had already landed on 2026-11-01. The measurements below compare the landed tree with a tar copy whose `attributes.js` is restored to `f58a267d^`.

## Verification

Harness: the CDP scripts in `/tmp/gui-perf-20261006` (`refattr.mjs`, `localise3.mjs`, `keys.mjs`, `caret.mjs`, `boot.mjs`) against the web profile. Both trees were served from their own `FREDDIE_HOME` after a workspace pick.

| Check | Pre-fix (f58a267d^) | Landed tree |
| --- | --- | --- |
| No-op `ref` attribute writes, 40 keys | 920 (23.0 per key) | 0 |
| DOM mutation records per key | 37.0 (1481 for 40 keys) | 14.0 (561 for 40 keys) |
| Textarea carries `ref` attribute | yes (30 chars) | no |
| Outlets carrying `ref` attribute | yes (first of 25 checked; 600 no-op writes on outlets in 40 keys) | none found; 0 outlet ref writes |
| Input p50 / p90, two 40-key runs | 10.5 / 16.7 and 9.1 / 16.3 ms | 9.6 / 16.0 and 9.6 / 17.5 ms |
| Caret check (abcdef, Left x3, X) | abcXdef, caret 4 | abcXdef, caret 4 |
| JS modules at startup | 245 | 245 in every captured run except one reporting 246 |
| Textarea ready, interleaved cold starts | 1614, 1296, 1332, 1123 ms | 1239, 1090, 1117, 1133 ms |

The ref callback was witnessed on an instrumented tar copy of the landed tree that records each node passed to `ref`: the callback ran 120 times, and the composer's current textarea was among the recorded nodes, connected, with no `ref` attribute. `#inputEl` is a private field, so the callback's effect is the only observable.

After a workspace pick, the composer reaches the plain phase in both trees, but focus does not move to the textarea automatically (active element BODY in both). A click focuses it and typing lands, which the input runs confirm.

Startup timings track machine load (loadavg 6 to 8 during the runs). Both trees fall in the same range, but the old 932 to 1148 ms band was not reproduced on this host; this is a parity result under identical load, not a band pass.

## Alternatives considered

- Filter `ref` in `applyDiff.js` and `createDOMElement.js` before calling `updateAttributes`. Rejected: `updateAttributesCore` is the single point where props become DOM writes, and every caller would need the same filter.
- Skip unchanged `ref` values by comparing with `oldProps`. Rejected: the ref callbacks are fresh closures on each render, so the comparison is always unequal and the writes would stay.
- Memoize the ref callbacks in the composer and outlets. Rejected: the fix would be spread across components, and the webjsx layer is the one that knows `ref` is not an attribute.

## Consequences

`ref` never appears as an HTML attribute, so `[ref]` selectors and attribute reads on those elements stop matching. No code in this change depended on that; the attribute carried function source text only, and no search for `[ref]` selectors was run. Per-keystroke mutation records drop from 37 to 14, and the remaining 14 are outlet and panel `data-ce` attributes, DIV child-list changes and text nodes.
