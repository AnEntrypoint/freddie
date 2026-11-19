# Agent Note: txiki zlib.gunzip

Status: implemented

## Problem

zlib.gunzip was a gap under txiki because CompressionStream and DecompressionStream throw for every valid format in this build. An owned inflate can be checked exactly against Node's gunzip output.

## Decision

- gunzip is a pure-JS RFC 1951 inflate with RFC 1952 gzip framing and CRC-32 and length checks. Node is the oracle for every shared case: fixtures are Node's gzipSync output, and malformed inputs take Node's codes and messages.
- Header flags are parsed. Two cases set them by patching Node's bytes, because Node's gzipSync never sets them.
- Bytes after a member must start another gzip member, as in Node.
- zlib.gzip stays a gap. Matching Node's deflate bytes is an owner decision.

## Alternatives considered

- Keep gunzip a gap until the build provides a working zlib backend. Rejected: inflate is small, deterministic and fully checkable.
- Depend on a maintained inflate package. Not taken, because the runtime package has no dependencies and the owned code is checked against Node exactly.

## Consequences

- The txiki gap list drops zlib.gunzip (44 to 43).
- Messages for malformed streams not covered by a fixture (invalid block type, invalid distance) are not verified against Node.
