# AGENTS.md — output-retention

## Rationale

- `index.js` suffix window: whole leading chunks are dropped once they slid out of the last `suffixCap` bytes. A single chunk larger than the window stays whole through that loop (dropping the only chunk would leave fewer than cap bytes), so its leading excess is trimmed afterwards to keep the accumulator and `finish()` concat bounded; `finish()` reads only the last `suffixLen <= suffixCap` bytes, so nothing it would return is lost.
- Push accounting: cumulative omission is computed through `omittedAt`, the same way `finish()` does, so `push` and `finish` never disagree; each push only asks whether this chunk pushed the total past what the two caps hold.
- `finish()`: with nothing omitted by budget, prefix and suffix are adjacent slices of one stream, so a codepoint may span the head/tail split and the whole is decoded as one buffer; trimming or decoding the halves separately would corrupt it. Only a real omitted gap makes each side a true cut: each side is trimmed to a UTF-8 boundary and decoded separately.
- `finish()` reports omission against the bytes actually returned, not the pre-trim budget: a boundary trim drops partial-codepoint bytes too, and a budget-derived count would overstate the retained text in any "Omitted N bytes" notice.
- `trimTrailingPartialUtf8` scans back over at most 3 continuation bytes (a UTF-8 sequence is at most 4 bytes); a byte that is not a valid lead is left untouched.

- Retained items remain in push order; seen counts every submitted item, including omissions. truncated reports omitted available content. Text remains UTF-8 boundary safe; counts include boundary bytes removed as well as budget gaps. Keep none, exact-count, and unknown-count notices distinct.
