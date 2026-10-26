# 01-orient: trav-gm-7

session: orch-fin-1792994560-7712-5
row: trav-gm-7
file: packages/client/ui-conversation/src/client/chat/ChatView.js

## acceptance

Row text (not derived): "Keep one #atBottom field and read it at all eight sites that use either name."

## row premise

Row claims `#atBottom` and `#atBottomRef` are two booleans always written together (lines 249-250, 293-294, 390-391, 464-465).

## tree state (live)

- Local HEAD = origin/main = `0efe05d90129d57a903b66b2e0756c75447afb68`. `git_status` scoped to the file: clean, `dirty: false`.
- `atBottomRef`: 0 occurrences. Literal, whole word, exhaustive over 4819 files. Dispatch `1792995148278-562-da1429f6210bb770`. Dual mode confirms `literal_scan_matches: 0`. Dispatch `1792995333877-737-6fe5957ef600a841`.
- `atBottom` (literal, whole word): 14 lines, all in ChatView.js. Dispatch `1792995153652-565-1b1a13e355c509eb`. Declaration at 195 (`#atBottom = true`). Writes at 248, 291, 387, 460. Reads at 245, 281, 301, 328, 365, 382, 386, 566, 659.
- Cited lines 249-250, 293-294, 390-391, 464-465 do not contain `atBottomRef`. Current writes are at 248, 291, 387, 460.
- Remote read of `main:ChatView.js` via `gh api contents?ref=main`: `atBottomRef` lines `[]`; `#atBottom` lines 195, 245, 248, 281, 291, 301, 328, 365, 382, 386, 387, 460, 566, 659.

## history

- `0312ec5d49` (2026-10-16T21:58:25Z, "fix(client): assertive unknown-kind guards, copy, and focus-aware list behaviour") deleted all 10 `atBottomRef` diff lines in ChatView.js. Every such line is a `-` line.
- Earlier commits (`89cff3fba4`, `92dbe0dac8`, `4efb09e5c8`) carried `atBottomRef` lines and were superseded by it.

## codeinsight

- `callers atBottomRef`: index `store_busy`, `complete: false`, 0 edges. Not evidence; the literal scan above is the confirmation.
- `callers atBottom`: index `complete: true`, 0 edges. A private field has no call edges, so this is expected.
- `impact` on a field: not applicable (no call graph).

## derived facts

1. The `-Ref` boolean the row names does not exist on `main`. The premise "two booleans always written together" is refuted by the live literal scan and the remote read.
2. The acceptance (one `#atBottom` field, read at every site that uses it) is already met on `main`.
3. This row requires no edit. Any edit to ChatView.js would be a no-op.
4. The row's witness plan (GUI scroll flip, before and after) tests a change that this row does not make. It is not required to close the row. The honest closure is a stale premise, witnessed.

## unknowns for the next stage

- U1: is `atBottomRef` present anywhere in the tree or remote `main`? Answered by runs above: no.
- U2: does `#atBottom` cover every site that the row names? Answered: yes, 14 lines in one file, one name.
- U3: does any uncommitted lane touch ChatView.js? Answered: no (`git_status`, clean).

Next: `gm-unknowns`.
