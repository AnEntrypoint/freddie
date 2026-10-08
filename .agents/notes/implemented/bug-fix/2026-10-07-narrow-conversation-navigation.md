# Agent Note: Reachable navigation in narrow conversations

Status: implemented

## Problem

A narrow conversation can clip trailing view tabs. Browser focus scrolling does not fully reveal a tab already partly visible. The collapsed sidebar also needs an accessible Settings name.

## Decision

The conversation owner provides a horizontally scrolling tab strip and reveals each focused tab with native nearest scrolling. Scroll padding reserves room for the focus outline. The Settings owner retains localized trigger text and visually hides it when the rail collapses.

## Alternatives considered

**Rely on browser focus scrolling.** A native Tab at390px leaves the focused Trajectory label partly outside the scrollport. Explicit nearest scrolling establishes the complete-label guarantee.

**Wrap the tabs.** Additional rows displace the transcript and composer. Independent horizontal scrolling preserves the compact header.

**Add a fixed English accessible name.** The trigger owns localized text, so hiding that text visually preserves both naming and locale behavior.

## Consequences

Extensions may contribute longer tab labels without losing keyboard reachability. Focus scrolling is immediate and respects the existing scroll body. The collapsed Settings trigger uses the same translation as the expanded sidebar.

## Verification

Native Chrome Tab and Enter at390px and320px reveal and activate Trajectory. At320px its bounds227.64–288.11 fit within the strip76–292, including the2px focus outline. Native Enter opens Settings; Escape closes the modal and restores focus to the named trigger.
