# Agent Note: txiki crypto.createHash

Status: implemented

## Problem

crypto.createHash was a txiki gap. Digest parity with Node is exact and checkable, so an owned pure-JS implementation can be verified without a runtime dependency.

## Decision

- md5, sha1, sha256 and sha512 are implemented in pure JS. The SHA-2 round constants and initial values are derived from the first primes by integer roots, so no constant table is typed in.
- Any other algorithm throws the documented gap message. The shared cases expect Node's digests for the four supported algorithms, and the gap case asserts the message for sha3-256.
- Algorithm names are case-insensitive, as in Node.
- Errors match Node's messages for digest reuse and for a non-string, non-view update argument.

## Alternatives considered

- Keep createHash a gap until tjs:hashing is vendored. Rejected: the digests are exact and checkable, and the vendored build is not expected to change soon.
- Depend on a maintained hash package. Not taken for this step, because the runtime package has no dependencies and the owned code is small and fully checked against Node. This choice can be revisited if the owner prefers a dependency.

## Consequences

- The txiki gap list drops crypto.createHash (45 to 44).
- Unsupported algorithms throw the gap message rather than Node's "Digest method not supported", so an unknown name is reported as a gap.
