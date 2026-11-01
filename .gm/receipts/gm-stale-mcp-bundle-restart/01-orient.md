# 01-orient: gm-stale-mcp-bundle-restart

session: mcp-codemode-3535970-1793542718115-1-6
row file: .gm/prd/gm-stale-mcp-bundle-restart.yml (status pending, session_id gm-freddie-eff-20261012)

## acceptance (from row)
Make the MCP server detect a newer installed bundle at startup of each tool call and report `restart required` with the exact command, or hot-swap, so a stale server is never silently in use. Witness: install a newer bundle in a temp copy and confirm the reply names the mismatch.

## symbols named by the row
- `gm-mcp-server` (MCP server), `bundle`, `stdio server`: codeinsight callers and impact return 0 edges and 0 reached (dispatch 1793543258605-345-f507c07d0b653f42, 1793543259352-347-92bb045606229904). No defining symbol in this repo.

## codesearch (dual + literal)
- dual `gm-mcp-server` (dispatch 1793543222500-280-9d79aede19c4f083): bm25 top hits are packages/mcp/mcp-client, packages/mcp/mcp-resources, packages/experimental/browser-use-chrome-devtools-mcp; none is a gm-mcp server. commits top-20 hits are .gm/ receipt and PRD commits; none touches a gm-mcp server source.
- literal `gm-mcp-server` (1793543228148-295-273fd25aec9048fa): 3 hits, all in .gm/memories.
- literal `gm-tools` excluding .gm/.agents/docs (1793543240149-324-60bb335135e8829e): 3 hits, packages/gm/gm-client/AGENTS.md:8, packages/gm/gm-client/README.md:10, packages/gm/gm-client/src/daemon.js:107 (`join(homedir(), '.gm-tools', name)`). These spawn agentplug-runner; none serves the MCP bundle.
- literal `gm-mcp` excluding .gm/.agents (1793543241389-325-ffebaf45dfe888f1): files packages/gm/gm-client/README.md and packages/gm/tool-gm/AGENTS.md only, both prose linking the external repo https://github.com/AnEntrypoint/gm-mcp.
- filename `mcp` under packages/gm (1793543245365-330-beb22714cedf9305): 0 files. packages/gm has no gm-mcp server source.
- literal `0.2.37`, `restart required`, `stdio server` (1793543230387-302-f9e8bb71ba8ab1e1, 1793543232636-310-d6c27b71fc1acfa6, 1793543231579-307-56d8cbf708b8487): hits are .gm/prd.yml:267 and .gm/prd/ copies of the row text, plus memories. No code.

## the named artifact (outside the repo)
- The row's file `C:/Users/user/.gm-tools/gm-mcp-server.mjs` is the Windows form of the installed bundle. On this host `/config/.gm-tools` resolves to `/data/cache/gm/.gm-tools` (fs_stat 1793543263181-352-eef320c03678bbb6: `gm-mcp-server.mjs` is a file, size 2304623, mtime_ms 1793539700546). It is outside the project root `/workspace/freddie` and is not a tracked file of this repo.
- It is a fetched artifact, not an authored source: `gm-mcp-server.mjs.fetched.json` records etag, sha, commit_sha from a remote fetch and `outcome: not_modified` (1793543278620-362-7f4adf576ad436b4); `gm-mcp-server.mjs.checked` holds a checked_at timestamp (1793543276758-357-7843127b2c069ab7). Its next fetch replaces it, so an edit there is overwritten.
- `agentplug-runner.version` = v0.1.568 (1793543267962-354-a2b2b5944f2c5d15).
- The server's source lives in the external repo AnEntrypoint/gm-mcp, not in /workspace/freddie.
- The memory note `.gm/memories/mem-4f3d1e57f6116795-910.md:10` records that `~/.gm-tools/gm-mcp/bin/gm-mcp-server.js` is absent while the live tool still answers.

## facts the row relies on
1. A stale-bundle check belongs in the gm-mcp server (external repo), not in /workspace/freddie.
2. The bundle named by the row is a fetched 2.3 MB artifact that the updater overwrites.
3. No edit target exists in this repo; the witness (install a newer bundle in a temp copy) needs the server source, which is not present here.

## successor
gm-unknowns: write the open unknowns (edit target, owner repo, live witness path). gm-eliminate runs a live JIT check on each and records dispatch ids before any blocker is filed.
