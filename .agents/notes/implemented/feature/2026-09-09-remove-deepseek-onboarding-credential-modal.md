# Agent Note: remove the official-DeepSeek first-run credential modal

Status: implemented

## Problem

[The official DeepSeek first-run credential setup](2026-07-30-deepseek-onboarding-credential-setup.md) blocked the empty conversation Hero behind a modal titled "Add an API key to get started" whenever the shipped `deepseek-official` route had no stored credential. The product no longer wants a blocking first-run prompt for this: a user with no configured provider now reaches the ordinary product surface directly and repairs the missing credential through the Models page (`ui-settings-models`'s existing configured/setup-card posture), which already renders an open setup card in place of a row for an unconfigured provider.

## Decision

**Un-register the step; keep the shared seam.** `ui-settings-models`'s `apply()` no longer calls `ctx.slots.inject('settings.onboarding', ...)` for the `deepseek-official` entry — `DeepSeekOnboardingDialog.js` (and its `.css`/`.css.js`) are deleted along with the now-orphaned `onboardingTitle`/`onboardingDescription`/`onboardingLater`/`onboardingSave`/`onboardingSaving` locale keys (`en`/`zh`). The `settings.onboarding` list slot itself, `OnboardingModal.js`'s shared modal chrome, and `SettingsRoot.js`'s onboarding-step coordinator are untouched — they are the general-purpose seam other first-run steps (e.g. `WelcomeNotice`) render through, not the removed feature.

**No replacement prompt.** The credential-missing state now completes the coordinator pass silently (there is no registrant for it any more), identical to how the original decision already treated an absent adapter, inactive route, or read-only deployment. The Models page remains the sole surface for adding a credential.

## Alternatives considered

**Keep the modal but make it dismissible without `credentialRequired`.** Rejected: the product wants no first-run interruption at all for this state, not a softer one — a step that renders once and can be skipped still adds a render pass, a locale surface, and a slot registration to maintain for behavior nobody wants.

**Fold the credential prompt into the Models page's setup card instead of a modal.** Not needed: the setup card described in the original decision already exists and already serves this purpose for every unconfigured provider, DeepSeek included, once the blocking step stops racing it.

## Consequences

A first-run user with no configured provider now lands on the ordinary empty Hero with no interstitial; adding the official DeepSeek credential happens through the Models page's setup card like any other provider. `ProviderEditor`, `credentials.set`, and the readiness-projection store this feature built are untouched — they remain load-bearing for the Models page itself, only the onboarding call site is gone. `packages/client/css-manifest/src/manifest.js` and both locale dictionaries lost their now-orphaned entries in the same change.

The repo has no automated test suite ([why](../testing/2026-09-02-drop-automated-test-suite-testing-notes.md)), so removal is normally verified live. `pnpm freddie web`'s full boot currently fails before reaching the client for an unrelated, pre-existing reason: `packages/client/hmr/src/index.js:239` does a bare `require.resolve('@freddie/freddie-client-web/package.json')` that `packages/client/hmr/package.json` never declares as a dependency, and pnpm's strict linker (by design, [pnpm-over-yarn](../process/2026-06-16-pnpm-over-yarn.md)) does not expose it there — confirmed independent of this change and of webjsx's migration ([framework/webjsx](../../../../framework/webjsx/README.md)) by resolving the same specifier from the same path outside any Cordis boot. This change is instead verified statically: every touched file passes `node --check`, the removed slot registration and its sole caller are the only occurrences of `DeepSeekOnboardingDialog`/the five orphaned locale keys repo-wide, and `pnpm run publint` is clean.
