# Agent Note: Readable conversation chrome

Status: implemented

## Problem

Narrow conversation headers squeeze the session title between secondary controls. The metrics dock can exceed its centered flex parent and hide recorded measures behind truncation.

## Decision

The header is an inline-size container. Narrow headers place the current wrapping title above mode and log controls; desktop headers retain one row. Metric groups wrap within the composer width. InputBar constrains its direct dock outlet to that width, so a centered flex child cannot keep its intrinsic content width beyond the available space. Statistics retain their existing projection and formatting owners.

## Alternatives considered

**Shrink the title and controls.** Reducing type weakens session recognition and target legibility.

**Hide secondary controls.** Mode and session-log access remain meaningful navigation.

**Keep one scrolling metric line.** Although native scrolling exposes all content, the mobile review still requires readers to discover hidden measures. Wrapping a few compact groups preserves direct access.

**Fit the metric text to the viewport.** The composer has its own available width after sidebar and panel sizing. Constraining the owning dock uses that actual composition instead of a viewport guess.

## Consequences

Long titles and metric groups can add header or dock height on narrow screens. The full transcript and composer stay within their own scroll ownership. Removing truncation also removes the statistics tooltip and resize observer.

## Verification

An independent live review at 320 pixels sees the complete historical session title inside x76–288 and all three metric groups inside x72–296. Their scroll widths equal their client widths. Native Tab reveals each contributed view destination.
