# Agent Note: Harness-driven contribution path to gm/agentplug/gm-config

Status: implemented

## Problem

This machine has writable checkouts at `C:\dev\gm`, `C:\dev\gm\agentplug`, and `C:\dev\gm\gm-config` tracking AnEntrypoint remotes. `rs-plugkit` is a writable tree on detached HEAD. A self-improvement run that needs an upstream heartbeat fix has nowhere documented to put a local commit, and a push to AnEntrypoint is world-scope.

## Decision

Local commits in those checkouts are allowed. Push or PR to AnEntrypoint requires explicit user go-ahead (`AskUserQuestion`). `AGENTPLUG_HOME` isolates a local `agentplug-runner` from the machine-wide daemon; never kill the shared pid to verify a heartbeat change.

## Alternatives considered

**Only file issues upstream and wait.** Rejected: the project ticker stall is witnessed on this machine and the agentplug tree is already writable.

**Always push after a local commit.** Rejected: AnEntrypoint is world-scope.

## Consequences

Heartbeat cheapening lands in `C:\dev\gm\agentplug` on `main` locally. This harness repo documents the path; it does not vendor agentplug source.
