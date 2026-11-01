# 02-unknowns: gm-stale-mcp-bundle-restart

session: mcp-codemode-3535970-1793542718115-1-6
recorded with mutable-add (dispatch ids 1793543321328-453-93547d141bbd27f0, 1793543321661-454-763285d24fb539ea, 1793543321971-455-7c9d567f2b71b6b2, 1793543322310-456-16661040e6fc176b)

## unknowns
- U1 (gm-stale-mcp-bundle-restart-U1): is there a local checkout of the gm-mcp source (AnEntrypoint/gm-mcp) on this host, and does it hold a bundle-version check at tool-call startup? Answers whether an edit target exists outside this repo.
- U2 (gm-stale-mcp-bundle-restart-U2): what bundle version does the live gm-mcp server report now, and does it match the installed bundle at /config/.gm-tools/gm-mcp-server.mjs (2304623 bytes)? Answers whether the stale condition holds on this host.
- U3 (gm-stale-mcp-bundle-restart-U3): does the running server re-read its bundle path after an install, or keep the startup image? Answers whether restart-required or hot-swap is the mechanism the row can use.
- U4 (gm-stale-mcp-bundle-restart-U4): does the gm_codemode reply header expose the server bundle version, so a per-call check can compare without a new field? Answers the witness reply shape.

## successor
gm-eliminate: a live JIT check per unknown, dispatch id recorded before any blocker is filed.
