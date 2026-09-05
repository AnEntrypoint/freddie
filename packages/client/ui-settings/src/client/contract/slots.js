/**
 * Settings slot contract — the canonical home of every settings slot type,
 * owned by the settings domain base rather than by the shell that renders
 * them (ui-settings-general, which occupies `sidebar.settings`). The shell has
 * zero copy of its own: ALL text (trigger label, panel title, header actions,
 * close aria, section content) arrives from registrants. A feature owns its
 * own settings pages — adding a setting never means editing the shell; copy
 * that belongs to no single feature (chrome, the General section) is owned by
 * ui-settings-general too.
 *
 * Slot type contract (formerly a `declare module '@freddie/freddie-client-ui-slots'`
 * augmentation) — compile-time only, dropped in the buildless conversion:
 *
 * 'settings.trigger': { kind: 'single', scope: 'root', owner: SettingsTriggerOwnerProps }
 *   The sidebar-foot trigger row content: icon + label, supplied as slot
 *   content (the accessible name comes from the content — rail state
 *   renders the label visually hidden). The shell renders the button
 *   chrome and owns open state. Absent contribution degrades to an
 *   icon-only button without an accessible name (broken-composition state;
 *   the shipped composition always registers the seat).
 *
 * 'settings.header': { kind: 'single', scope: 'root', owner: SettingsHeaderOwnerProps }
 *   The panel title text seat. Content renders inside the nav heading row;
 *   the dialog's accessible name points at that node via aria-labelledby.
 *   Absent contribution leaves the heading empty.
 *
 * 'settings.action': { kind: 'list', scope: 'root', owner: SettingsHeaderOwnerProps }
 *   Optional actions rendered in the content-column header before Close.
 *   Registrants own visibility, behavior, copy, and failure presentation;
 *   the shell supplies only the ordered render site.
 *
 * 'settings.close': { kind: 'single', scope: 'root', owner: SettingsHeaderOwnerProps }
 *   The close button's visually-hidden label text (the button itself —
 *   icon, geometry, focus — is shell chrome). Absent contribution leaves
 *   the button without an accessible name (broken-composition state).
 *
 * 'settings.section': { kind: 'list', scope: 'root', owner: SettingsSectionOwnerProps }
 *   One settings page per list entry. Registrant options carry the nav
 *   identity: `id` (section key, drives `only` filtering), `order` (nav
 *   position), `label` (registrant-localized display text — the registrant
 *   re-registers with fresh text on locale change, so the shell never
 *   subscribes locale state; the ledger bump doubles as the shell's
 *   re-render trigger). Sections render inside the panel content column.
 *   (`settings.general.item`, declared by ui-settings-general's General
 *   entry, is typed in the locale package — the common dependency of every
 *   item registrant; the shell neither declares nor renders it.)
 *
 * 'settings.plugins.tab': { kind: 'list', scope: 'root', owner: SettingsPluginsTabOwnerProps }
 *   One page inside the Plugins settings section. The section owner renders
 *   localized entry labels as tabs and mounts each contribution inside its
 *   corresponding tab panel. Options: `id` (tab key), `order` (tab order),
 *   and `label` (registrant-localized tab text). Declared at runtime by the
 *   feature that owns the Plugins section; the type lives here so inventory
 *   and configuration plugins collaborate without depending on one another.
 *
 * 'settings.onboarding': { kind: 'list', scope: 'root', owner: SettingsOnboardingOwnerProps }
 *   Root-scoped onboarding steps contributed by settings features. The
 *   shell mounts one ordered step at a time; the active registrant either
 *   completes itself or keeps ownership until the user completes its sole
 *   path. Registrants own readiness, copy, dialog behavior, AND visible
 *   chrome: a step wraps its visible content in its modal surface (including
 *   `#root` inert ownership) and renders null while private facts are still
 *   loading. The shell paints no chrome of its own, so a mounted-but-deciding
 *   step shows and blocks nothing.
 *
 * 'settings.general.item': { kind: 'list', scope: 'root', owner: SettingsGeneralItemOwnerProps }
 *   One preference row inside the General section — the additive seat for a
 *   single setting that needs no page of its own (a whole page is
 *   `settings.section`), contributed by the feature plugin that owns the
 *   preference (locale → Language, ui-theme → Appearance, ui-conversation →
 *   Composer Enter). Options: `id` (row key), `order` (row position). The
 *   section column only stacks rows, so a row draws its own internals,
 *   including its label: nothing projects a `label` here and the owner passes
 *   no props at all — copy, current value, and the write path are all yours,
 *   through your own inject face and `host.call`. Declared at runtime by
 *   ui-settings-general's General entry; the type lives here with every other
 *   settings slot type, because this package is the settings domain's base
 *   layer and every registrant already depends on it for `ctx.settingsScope`.
 *
 * The following owner-props shapes were TypeScript interfaces documenting
 * each slot's owner share; they carried zero runtime representation and are
 * intentionally dropped here (this file has no runtime exports of its own):
 *
 * SettingsGeneralItemOwnerProps — owner share of a General preference row
 *   (the section supplies nothing); marker field only.
 * SettingsPluginsTabOwnerProps — owner share of a Plugins tab (the section
 *   supplies nothing); marker field only.
 * SettingsTriggerOwnerProps — owner share of the trigger content seat: the
 *   sidebar column state (`wide: boolean`).
 * SettingsHeaderOwnerProps — owner share of the header title seat (the shell
 *   supplies nothing); marker field only.
 * SettingsSectionOwnerProps — owner share of a settings section entry:
 *   `close: () => void`, the one shell affordance a section receives, for
 *   flows that leave settings altogether (starting a session from a
 *   section) — the onboarding coordinator's `openSection`/`complete`
 *   precedent, inverted.
 * SettingsOnboardingOwnerProps — owner share of the currently active
 *   settings-backed onboarding step: `stepId: string`, `complete: () => void`,
 *   `openSection: (id: string) => void`.
 */
