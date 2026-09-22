# Agent Note: Web profile disables module HMR

Status: implemented

## Problem

The base bundle mounts module HMR with a repository-wide Chokidar root. The web profile uses client HMR and does not need that module watcher. Starting the web profile can exhaust the host's inotify-instance limit before the server binds.

## Decision

The web bundle replaces the inherited HMR configuration with no module roots and polling for exact patch-file watches. The `client-hmr` row continues to reload browser modules.

## Verification

`pnpm run freddie --profile web` reaches web-profile boot without creating native module or patch-file watchers. The local web page loads from the running profile.

## Alternatives considered

**Raise the host inotify limit.** The default limit is a host resource policy and does not restore the web profile's intended reload ownership.

**Keep native module HMR enabled.** The web profile has an independent client reload path, so an additional recursive native watcher is unnecessary and can prevent startup.

## Consequences

Web profile source edits use client HMR and polling patch-file watching. Module-reload HMR remains available to profiles that mount it deliberately.
