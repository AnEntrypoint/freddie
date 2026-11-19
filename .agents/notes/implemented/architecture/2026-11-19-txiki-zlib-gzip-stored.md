# Agent Note: txiki zlib.gzip as stored blocks

Status: implemented (round trip); byte parity open

## Problem

zlib.gzip was a gap under txiki because the txiki build has no working zlib backend. A round trip needs no compressor.

## Decision

- zlib.gzip writes stored (uncompressed) deflate blocks in pure JS, with the gzip header, CRC-32 and length trailer.
- zlib.gunzip (pure JS) decodes the output.
- Compressed byte parity with Node remains an open owner decision.

## Alternatives considered

- Keep zlib.gzip a gap. Rejected: a valid gzip stream is verifiable under Node and is useful to callers that do not need Node's exact bytes.
- Port zlib's deflate. Not taken: a codec of several hundred lines, which is the owner decision.

## Consequences

- zlib.gzip leaves the gap list. The names stay present.
- Output length differs from Node for every input, so no shared case checks it.
