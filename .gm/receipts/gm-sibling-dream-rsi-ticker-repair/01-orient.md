# 01-orient: gm-sibling-dream-rsi-ticker-repair

session: mcp-codemode-3535970-1793542718115-1-7
row file: .gm/prd/gm-sibling-dream-rsi-ticker-repair.yml (names no file path)

## acceptance (row's own, not derived)
"When GM sibling worktree ownership permits a change, its ticker emits a registered replay-cycle verb with valid replay identifiers and a live spool witness shows successful receipt without policy deployment."

## row premise
- Subject: runner emits unhandled `dreamrsi-replay` work lacking baseline/policy/world payload.
- Subject also says the sibling tree has concurrent-owner dirty state; mutation unsafe until owner clears or publishes.

## codesearch (dual / literal), freddie
- dual `dreamrsi-replay` in /workspace/freddie: dispatch 1793543206496-259-352bf7e894f686fa. Literal fallback only (bm25 route without index). 2 hits, both PRD rows: `.gm/prd.yml:117`, `.gm/prd/gm-sibling-dream-rsi-ticker-repair.yml:3`. No code hit in freddie.

## codesearch, sibling /workspace/gm (root=/workspace/gm)
- literal `dreamrsi-replay`: dispatch 1793543220323-274-7578538534e818a3. 1 hit: `agentplug/scripts/daemon-idle-floor-witness.mjs:8` (a verb-name list entry, not an emitter).
- literal `dreamrsi` in `rs-plugkit`: dispatch 1793543310788-431-dfd3ac6987d1c9e5. 0 matches in 342 files.
- literal `dreamrsi-replay` in `agentplug`: dispatch 1793543311634-433-2bac242962fa79f7. 1 match (same list line).
- literal `replay-cycle`: dispatch 1793543221047-276-6ea8e24309f3af67. 66 lines / 22 files; key sites:
  - `agentplug/AGENTS.md:17`: runner no longer ticks the dream cycle; the guest triggers `dream-replay-cycle` itself after each observation once 20 observations follow the owner's cursor (`replay_if_due` in `rs-plugkit/crates/plugkit-core/src/orchestrator/dream_cycle.rs`).
  - `rs-plugkit/crates/plugkit-core/src/orchestrator/mod.rs:414`: `"dream-replay-cycle" => dream_cycle::handle(content)`.
  - `rs-plugkit/crates/plugkit-core/src/orchestrator/dream_cycle.rs:27`: rejects non-object input.
  - `rs-plugkit/crates/plugkit-core/src/gates.rs:206`: verb gate.
  - `agentplug/crates/agentplug-host/src/registry.rs:2520`: registry entry.

## codeinsight
- callers `dream-replay-cycle` (root /workspace/gm): dispatch 1793543278061-360-fc1ed42a29d717c. 0 edges; `index_current: false`, symbol index refresh incomplete. NOT current evidence.
- impact `dream-replay-cycle` (root /workspace/gm): dispatch 1793543290507-375-b65a25eb68e7e378. Reply truncated; no usable edges.
- callers `dreamrsi-replay`: dispatch recorded in the same batch as callers above; it is a verb-name string, not a code symbol, so codeinsight is not the instrument for it.

## sibling tree state (read-only git)
- /workspace/gm: branch main, HEAD f7d1f0f1 (2026-11-01 16:19:47 +0200).
- `git status --porcelain`: 14 entries. Modified: agentplug, agentplug-bert, agentplug-libsql, agentplug-treesitter, gm-mcp, rs-codeinsight, rs-plugkit, rs-search, skills/gm-hop/SKILL.md, skills/gm-orchestrate/SKILL.md, skills/gm-prd/SKILL.md, skills/manifest.sha256. Untracked: .gm/disciplines/ste100/fiber-state.json, .gm/scratch-lanepool-1vh9pa/, .gm/scratch-r7-5b1e/.
- Dirty state is present now, consistent with the row's concurrent-owner claim.

## facts the row relies on
1. Row names no file. Edit target is not identified by path.
2. The ticker that emits `dreamrsi-replay` is not located in code. Only a verb-name list entry exists.
3. Registered replay verb exists: `dream-replay-cycle` (rs-plugkit orchestrator). AGENTS.md says the runner no longer ticks it.
4. Sibling tree is owner-dirty, so the row's acceptance gate ("when ownership permits") is not met at this moment.

## open for unknowns
- U1: Does any emitter produce `dreamrsi-replay` work at runtime (not by source literal)?
- U2: Does the sibling owner permit a change right now (dirty state cleared or published)?
- U3: Which file(s) would an edit touch, and is a file named by the row?
