# @freddie/freddie-acp-demo

## Rationale

- `Config` and the persistence passthroughs are deliberately duplicated per entry point (`jscpd:ignore` blocks): each app owns a complete, directly readable schema, and sharing them would make two small app contracts depend on a new facade.
- `toolOrder` uses `.default(undefined)`: absent means lexicographic order (as in the owning system-prompt schema), while schemastery's native `[]` default would read as an invalid configured list.
