# storage/ — non-session storage family

This family persists application data other than session event logs through named backends and typed data forms.

| Package | Role | ctx key |
|---|---|---|
| [`storage/`](storage/README.md) | Stores validated domain records in JSON files | `ctx.storageDomain` |

Consumers use the domain facility rather than accessing the backend directly. The [domain storage decision](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) records the family design.

The subsystem reference — the backend contract, `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` — is [docs/subsystems/storage.md](../../docs/subsystems/storage.md).
