# Agent Note: txiki StringDecoder encodings

Status: implemented

## Problem

StringDecoder under txiki decoded only utf8. Every other encoding threw the gap message, although the codec table already encodes and decodes each of them.

## Decision

- utf8 stays on TextDecoder with streaming.
- The other encodings use the codec table with Node's carry rules, ported from Node's string_decoder: base64 and base64url keep a 1 or 2 byte remainder; utf16le keeps an odd byte and a high surrogate at the end of a write; the others are stateless (latin1, ascii, hex).
- Node 24 is the oracle. The 40 split cases come from its output.

## Alternatives considered

- Keep the gap until the codec table is audited. Rejected: the codecs are already checked by the Buffer cases, and the carry rules are verified exactly by the split cases.
- Use TextDecoder for utf16le. Rejected: TextDecoder does not implement the Node encodings.

## Consequences

- The string_decoder gap is gone; unknown encodings still throw Node's "Unknown encoding" message.
