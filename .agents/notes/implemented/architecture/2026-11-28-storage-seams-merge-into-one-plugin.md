# Agent Note: The storage seams merge into one plugin

Status: implemented

## Problem

[The domain KV storage note](../../proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) split non-session storage into four packages: a hub (`ctx.storage`, a backend registry and a form table), a backend (`storage-json`), a data form (`storage-domain`) and the consumers. Each layer had exactly one implementation and one consumer: one backend, one form, and a route table that always named that backend. The layers added three packages, three bundle rows and a config (`backend`, `routes`) whose only valid value was `json`, without a second provider to justify them.

## Decision

`@freddie/freddie-storage` is one function plugin with one config key, `root`. It owns the JSON backend (`src/json-backend.js`, `unit.js`, `atomic.js`, `format.js`), the backend contract (`src/backend.js`, kept so a second medium has something to implement), and the domain facility that provides `ctx.storageDomain` (`src/facility.js`, `domain.js`, `spec.js`). The hub, the backend registry, the form table, the `storage.backend.json` service and the route config are gone. `storage-json` and `storage-domain` are deleted, and the four consumers (`workspace`, `message-feedback`, `session-artifacts`, `session-projection-cache`) import `defineDomain` from `@freddie/freddie-storage`.

The witness was the profile dumps: the web dump differs from before by exactly the removed rows (`storage-json`, `storage-domain`) and the `root` moving onto the `storage` row, the headless, acp and sdk dumps are byte-identical, and a fresh web boot recreates the unit files under the profile's `storages` directory. Import smoke counts 242 packages instead of 243 with the same two expected failures.

## Rejected

- Keeping the registry for a future second backend. Nothing registers a second one, and adding a registry back is a local change behind `DomainFacility`'s constructor.
- Merging the session-persistence seam in the same sweep. It will get a second implementation (fx's native session store, built to the conformance suite), so it stays a seam.

## Gave up

The `domain/changed` event and `StorageForms` merge point had no consumer outside the facility; consumers of the event (`apiproxy`, `workspace`) still receive it. A later second data form would add a mount point again, and the Agent Note above is the record of how it was shaped.
