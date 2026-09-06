# @freddie/cordis-plugin-group

Loader group plugin for nesting Cordis entries.

One of the harness's first-party framework packages — see
[`framework/README.md`](../README.md) for the layer overview. It is a workspace
package resolved through `pnpm-workspace.yaml`, not something installed
separately.

## Usage

```yaml
- id: tools
  name: '@freddie/cordis-plugin-group'
  group: true
  config:
    - id: logger
      name: '@freddie/cordis-plugin-logger-console'
```

Groups are always considered enabled themselves, but disabling a group entry
prevents its child entries from running. Nested entry ids use `:` separators,
for example `tools:logger`.

The package re-exports the `Group` implementation from
`@freddie/cordis-plugin-loader` as its default plugin.
