# @freddie/freddie-client-locale

Locale plugin: LocaleRuntime — English is the only shipped language, so there is no settings row and no persisted preference for it; a `locale` section left in an older `$FREDDIE_HOME/settings.yaml` is an unregistered section the settings service preserves and ignores. The plugin points `<html lang>` at `en` on activation. The service owns the ns×locale dictionary registry (typed `register(ns, {en})` checked against `LocaleNamespaceMap`, `bind(ns)`→`TranslateNS<ns>`; lookup chain ns → common → key), implements the slot system's `LocaleFace`, and installs itself through `ctx.slots.installLocale`, backing the framework-injected `t` standard seat (`Translate`/`TranslateNS` are ui-slots types; import them from there — this package only re-exports for dictionary owners' convenience).

## Model Experience

None, as the locale registry serves browser UI copy; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Some surfaces keep inline copy** — Settings rows, the sidebar, question composer, and model select use locale seats; other packages still own static text directly.
- **Registry-held text reads its translation once** — copy captured at registration time outside the slot render path (e.g. the `/model` command description in the command registry) keeps the dictionary state it was registered under until re-registration; slot-rendered copy follows dictionary registrations live.
