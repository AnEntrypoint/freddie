# 03-eliminate: gui-dada-design-closure-20261007

Each unknown: expected value written from the row contract before its run, then the live run and its dispatch id.

## u1 gui-dada-design-closure-20261007-u1-skill-present
- expected: isFile true at /config/workspace/gdaa/skills/dada/SKILL.md (row subject, yml line 2)
- run: fs_stat allowOutsideRoot, dispatch 1793543326232-467-a519c921b782929b (repeat of 1793542844061-45-7b4cff74126fc5b7)
- observed: not_found
- result: NOT MET. Resolved with witness_evidence (unknowns-log.jsonl, dispatch 1793543336023-494-e92e0d120807b3b6).

## u2 gui-dada-design-closure-20261007-u2-skill-elsewhere
- expected: a dada skill exists at some located path
- runs: fs_readdir /config/.claude/skills 1793543244077-329-d57d8cd040402104 (21 entries, no dada); /config/.agents/skills 1793543329424-476-885c3f86162b296b (20 entries, no dada); /workspace/freddie/.agents/skills 1793543329666-478-98a8496fa1fa9754 (9 entries, no dada); /workspace 1793543246719-333-931fca7cf3526413 (no gdaa); /config 1793543247076-334-7064766d79bb8513 (no workspace)
- observed: none
- result: NOT MET. Resolved (dispatch 1793543340773-508-c9c476301c4c7d).

## u3 gui-dada-design-closure-20261007-u3-edit-files
- expected: the row names at least one source path for the edit
- run: read the row yml (.gm/prd/gui-dada-design-closure-20261007.yml line 2) and fs_stat DESIGN-LOG.md 1793542839925-42-bc94c6d4ca3859e7
- observed: the row names only DESIGN-LOG.md (present, 92115 bytes) and the absent SKILL.md. No source path.
- result: NOT MET for a source edit. Resolved (dispatch 1793543341095-510-db90aabc53631b2c).

## u4 gui-dada-design-closure-20261007-u4-protocol-required
- expected: the five-critic panels, pre-move records and saturation rounds can be produced from the row's named protocol
- runs: u1 and u2 above
- observed: the named protocol is absent. Skill-list entries anthropic-skills:graphic-design-adaptive-critics and graphic-design-ambition-workflow are different skills; the row names only the located dada SKILL.md, so substitution is not authorized.
- result: NOT MET. Resolved (dispatch 1793543341398-512-950105d7f487808c).

## open unknowns after this stage
None open. Every unknown was probed live and resolved with its evidence.

## consequence for the next stage
The edit stage needs a file the row names (u3) and the protocol the row names (u4). Neither holds, and both were probed live. The edit cannot run here, so the executor files a blocker rather than guessing a file or substituting a skill.

## gm friction seen in this stage (for gm improvement)
- mutable-resolve refuses {status, observed, dispatch_id}; the verb needs {mutable_id, witness_evidence}. The refusal names the right keys, but the skill text says "mark known" without naming them.
- mutable-add declares no body schema (gm.describe reports body_schema.declared false), so the first call had to be guessed.
- codesearch dual returned no bm25 or vector hits (route_without_index) and no retrieval error, only a commits channel. Literal mode answered the query.
