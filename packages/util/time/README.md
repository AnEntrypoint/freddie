# freddie-time

IANA time-zone validation and canonicalization for wire boundaries that accept a caller-reported zone (a browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, forwarded over RPC). `packages/host/apiproxy/src/api-proxy.js` carried this exact function inline; it now imports it from here. This library formats nothing and owns no failure vocabulary — each boundary declares and throws its own refusal shape from an `undefined` result.

## Surface

```js
import { canonicalClientTimeZone } from '@freddie/freddie-time'

canonicalClientTimeZone('America/New_York') // 'America/New_York'
canonicalClientTimeZone('UTC') // 'UTC'
canonicalClientTimeZone('America/Nowhere') // undefined — not a real IANA zone
canonicalClientTimeZone(' UTC') // undefined — not already trimmed
```

`canonicalClientTimeZone` accepts only `'UTC'` or an already-trimmed IANA `Area/Location`-shaped string, resolves it through `Intl.DateTimeFormat`, and re-validates the resolved name against the same shape before returning it. A zone identity is typically stored on a durable record and resolved again later by a different process, so the function returns the *canonical* name — what `Intl` actually resolved to — rather than echoing back an accepted alias that a later reader's own resolution might not compare equal to.

## Model Experience

The canonicalized zone name ends up in the model-visible "browser time zone for this request" policy line built by `@freddie/freddie-time-context`, so the model interprets otherwise-unqualified dates/times in the caller's real zone.

#### KV Cache effect

None directly; the caller decides whether and where the canonicalized value enters a request prefix.

## Known Limitations and Deferred Work

- **`@freddie/freddie-time-context`'s `request-zone.js` has its own inline copy with different behavior** (throws a descriptive `TypeError` per failure mode and requires the input to already equal its canonical form, rather than accepting any resolvable alias and returning the canonical value). That is a deliberate contract difference for a model-facing error path, not an oversight, so it was not swapped to import from here; revisit only if the two contracts are meant to converge.
