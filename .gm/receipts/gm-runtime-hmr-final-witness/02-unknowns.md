# 02-unknowns: gm-runtime-hmr-final-witness

session: mcp-codemode-3535970-1793542718115-1-9
recorded with mutable-add (status unknown). Dispatch ids: u1 1793543292845-384-568b0b36e964f3ac; u2 1793543291650-379-bed41581927bad83; u3 1793543291890-380-1c417880253256cb; u4 1793543292144-381-6dd8519173d06b6e; u5 1793543292375-382-dca0da77b67bf1a6; u6 1793543292612-383-6797304a89111c4b

- gm-runtime-hmr-final-witness-u1-journal-reach: Does the Hmr journal (Hmr.snapshot events, framework/hmr/src/index.js:510-515) reach the GUI-observable side after a host HMR reload, and through which service or projection field?
- gm-runtime-hmr-final-witness-u2-runtime-projection: Which projection field carries `runtime` into the `gm` object consumed by ObservabilityDock.js:175-182, and which code fills it from gm-client runtimeStatus (packages/gm/gm-client/src/index.js:116)?
- gm-runtime-hmr-final-witness-u3-idle-ordering: Does hmr/idle fire (framework/hmr/src/index.js:365) before the next model tool dispatch, so a fresh GUI GM tool dispatch follows the idle boundary rather than racing the reload?
- gm-runtime-hmr-final-witness-u4-leaf-values: Does a live GUI GM tool call on the active daemon yield runtime JSON whose gmVersion and runnerVersion equal readStatus/readDaemonStatus for the active daemon, and does the Overview GM runtime metric render them?
- gm-runtime-hmr-final-witness-u5-sibling-dependency: Is the sibling path gm-runtime-host-hmr-activation Post already in the tree at HEAD, or is it the live prerequisite this witness cannot run without?
- gm-runtime-hmr-final-witness-u6-fiber-health: How is "a healthy active ui-observability fiber" observed after reload (which fiber state read proves it is retained, not disposed)?

Open unknowns: 6. Next: gm-eliminate, each by a live JIT run.
