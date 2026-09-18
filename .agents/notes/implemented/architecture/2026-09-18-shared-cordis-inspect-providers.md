# Agent Note: Shared Cordis inspection providers

Status: implemented

## Problem

Creator-mode agents contribute the same Host inspection providers, while `ctx.cordisInspect` owns one process-wide identifier for each provider. A second Creator session therefore failed to mount and the preset picker fell back to Standard mode.

## Decision

`CordisInspectRegistryService.registerShared()` retains a provider only when every caller declares the same manifest. The provider remains registered until its final caller releases it; a conflicting direct or shared registration still fails loud. The Tool provider reads schemas from the requesting Agent, so its behavior is independent of whichever Creator scope first retained it.

## Alternatives considered

**One provider per Agent scope.** The inspection registry is Host-owned and provider ids name Host capabilities, so duplicating the registry would misstate its ownership and split the directory.

**Ignore duplicate registrations.** A no-op duplicate loses teardown ownership: unloading the original registration could remove providers still needed by another Creator session.

**Load the Cordis tools globally.** That would expose self-modification tools to presets that did not select Creator mode.

## Consequences

Creator mode mounts for multiple agents without competing for provider identifiers, and each Tool inspection reports the invoking Agent’s scoped tools. The shared-registration operation remains explicit so unrelated provider conflicts continue to fail loud.
