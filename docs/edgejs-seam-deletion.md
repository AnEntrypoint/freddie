# Seam deletion on edgejs (stage 2, freddie part): prepared, nothing changed yet

Plan: /workspace/hyperagent/specs/edgejs-swap.md, stage 2 (freddie): delete the shims in packages/util/runtime for every module edgejs provides, keeping the alias table, the parity cases and the node: import check. This file is Phase A only. The seam, src/txiki.js and every witness stay exactly as they are until the dispatcher's go decision.

## What the number is

Parity cases run under edge 0.2.5-g57af363 (Node 24.13.2 surface, V8 15.9.111) with the seam bypassed (test/parity-bypass.js): 846 of 859 shared cases pass and every node: module of the alias table imports. The 13 that differ: crypto createHash md4 (6), fs.createReadStream with highWaterMark 2^31-1 to 2^40 (5), fs.promises.cp error wording (1), stream Readable.wrap (1). A second probe (runs/analysis/edge-gaps.mjs, plain script) ran the things txiki cannot do, which the 4 gap cases and the ranked open list name.

| txiki gap or open item | under edge |
|---|---|
| AsyncLocalStorage (G1) | works: a store survives an await and a timer |
| vm.createContext and runInContext (G3), runInNewContext object result | work |
| spawnSync and execFileSync (G4) | work |
| spawn with a fourth stdio pipe | works |
| http.createServer with an upgrade listener (G6) | works: the upgrade event fires with request, socket and head |
| zstd decode (G2) and brotli decode | work |
| worker_threads.Worker with workerData (G5) | works |
| dns.lookup family 6 (G10) | works ([{ address: '::1', family: 6 }]) |
| fs.watch (G5 in the alias table) | works |
| fetch, import.meta.url, process.stdout.write, os.release | work |
| inspector.Session (G8) | does not: "Inspector is not available in this EdgeJS build" |
| module.stripTypeScriptTypes (G9) | does not: "Node.js is not compiled with TypeScript support" |

So the 12 named txiki gaps that have a shipped call site close under edge except inspector (one shipped consumer, runtime-diagnostics/inspector, which is a development tool) and stripTypeScriptTypes (no shipped call site).

## Region table for src/txiki.js (3,858 lines)

Lines per region are counted by line range over the file's top-level declarations (runs/analysis/seam-regions.py, host-local; every line belongs to exactly one region and they sum to 3,859). "edge provides" is the parity result for that module; "failing cases" are among the 13; "shipped path" says whether freddie's shipped code reaches a failing case.

| region | lines | edge provides | failing cases | shipped path hits one |
|---|---|---|---|---|
| Buffer, encodings, codecs | 242 | yes | 0 | no |
| fs (sync, promises, Stats and Dirent, Dir, cp, watchFile, createReadStream) | 661 | yes | 6 (highWaterMark 2^31-1 to 2^40 x5, cp wording x1) | no: the only shipped createReadStream calls (agent-instructions files.js, fs-local fsio.js) take default sizes and the one shipped highWaterMark (apiproxy session-export) is 65,536; the one shipped cp (agent-presets authoring) is caught as a failure and does not read the message text |
| module (createRequire, loadModule) | 25 | yes | 0 | no |
| vm (Script, runInNewContext) | 47 | yes, and createContext and runInContext as well | 0 | no |
| crypto (hashes, randomBytes) | 588 | yes | 6 (md4) | no: shipped createHash calls use sha256 and sha1 only (10 call sites) |
| url, util (promisify, parseArgs, parseEnv, deepEqual, isPromise), net.isIP | 266 | yes | 0 | no |
| os (networkInterfaces, platform, release, process object) | 71 | yes | 0 | no |
| string_decoder, timers/promises | 96 | yes | 0 | no |
| zlib (inflate, gunzip, gzip, crc32) | 367 | yes, and zstd and brotli decode | 0 | no |
| stream (Emitter, Writable, Readable, PassThrough, pipeline) | 947 | yes | 1 (Readable.wrap) | no: nothing shipped calls Readable.wrap |
| child_process (spawn, exec, ChildProcess) | 376 | yes, and spawnSync and execFileSync | 0 | no |
| worker_threads (Worker) | 22 | yes, with workerData | 0 | no |
| dns/promises (lookup) | 23 | yes, family 6 included | 0 | no |
| adapter infrastructure (gapError, withGaps, tjs handle, constants) | 128 | not needed: a runtime that is Node has no gaps to name | | |
| total | 3,859 | | 13 | 0 |

None of the 13 differences is reached by shipped code, so none blocks the swap. Of the 3,859 lines, every region is provided by edge; the md4 digest (about 40 lines) and the Readable.wrap path can simply go with the rest, because nothing ships a call to them.

## What stage 2 changes in packages/util/runtime, when go is given

1. Delete src/txiki.js, src/install-txiki.js and the ./install-txiki export. The runtime installed on edge is the one packages/util/runtime-node already builds (src/install-node.js): edge is a Node surface, so the node installer is the edge installer. Net: -3,862 lines of source.
2. Delete test/contract-txiki.js and test/parity-txiki.js, and the txiki rows of the alias table (aliases.json keeps one row per node: module; the "to" column becomes "runtime" for every row, and the "gaps" column empties except inspector and stripTypeScriptTypes). The alias check test/aliases.js and the shipped-code import rule stay.
3. Keep the 25 seam files src/<module>.js (5 to 27 lines each): they are the one place shipped code reaches Node, and the node: import check depends on them. Keep test/parity-cases.js, test/parity-fixture.json and the fixture check; add the 13 known edge differences to the cases as named expectations (an "edge" field per case, the Node output unchanged) so the parity run on edge passes 859 of 859 with the differences listed, and a new difference fails.
4. test/parity-bypass.js becomes the edge parity run itself (the same file, with the 13 expectations).
5. docs/fx-cut-table.md and the ledger: the runtime row's 7,549 lines drop by the txiki share; fx-split.md loses its txiki gap table.

## Witness and red checks for the deletion

- Witness: under edge, the full parity run through the seam (not bypassed) passes 859 of 859 with the 13 named differences, the four profile dumps keep their md5s, import smoke keeps 240 of 242, and the node: import check holds.
- Red: reintroduce one deleted shim path (restore src/txiki.js's createHash md4 into the seam and drop the md4 expectation) and the matching parity case fails; remove one of the 13 named expectations and the run fails on that case.

## Open and blocked

- Waiting on the go decision per repo (specs/edgejs-swap.md stage 0 gate). Nothing in this file is applied.
- The freddie-side run needs an edge binary at a stable path. The one used here is in scratch (/workspace/tmp/freddie/edgejs) and comes from the installer; gm's build is the stage 1 shared pin.
- inspector.Session is absent in this edge build; whether the next build enables it decides whether runtime-diagnostics/inspector keeps its named gap.
