# Agent Note: Shared SQLite runtime installer policy

Status: implemented

## Problem

The updated AnEntrypoint/libsql-plugkit-client Git dependency has a postinstall script that downloads an unsigned latest plugkit.wasm, checks only its size and writes bin/plugkit.wasm. Its runtime resolves libsql.wasm instead, preferring the shared ~/.agentplug/plugins directory. Running the installer neither verifies the artifact nor supplies the runtime file the client requests.

## Decision

Pin the updated source in the lockfile, but explicitly deny its build script in pnpm-workspace.yaml. Keep the shared system libsql runtime; do not provision a separate machine-specific copy.

## Alternatives considered

Approving the existing installer would execute an unverified download without satisfying runtime resolution. Retaining the old source pin would miss upstream changes while preserving the same installer problem.

## Consequences

Dependency installation does not bootstrap a missing libsql runtime. Hosts need the shared runtime supplied through the system's verified distribution path.

## Verification

The installed source and script were inspected before execution; the supply-chain scan reported no blocked or failing source hits. Frozen-lockfile installation succeeded with the build disabled. Freddie then restarted on the actual web profile and the real browser mounted with its normal WebApiClient and working composer. Package publication-shape validation passed.
