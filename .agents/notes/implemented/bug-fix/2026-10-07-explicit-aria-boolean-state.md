# Agent Note: Explicit ARIA boolean state

Status: implemented

## Problem

The shared renderer removed boolean false attributes. A real closed tool disclosure exposed no
`aria-expanded` state while native opening exposed `true`; many controls supply the same
boolean contract.

## Decision

Serialize ARIA values through attributes in HTML and SVG, retaining explicit false as `"false"`.
Null, undefined and omitted keys remove them. Native DOM properties and non-ARIA false handling
keep their existing behavior.

The [attribute serialization decision](2026-09-04-webjsx-attribute-serialization.md) remains
authority for DOM properties, data selectors and non-ARIA values.

## Alternatives considered

Convert every control value to a string. This duplicates a standard serialization contract
across callers and permits the omission to recur.

Preserve false for all attributes. Non-ARIA selectors and SVG optional attributes already rely
on false removing their attribute.

## Consequences

A fresh live historical conversation exposes closed/open/closed `aria-expanded` as
`false → true → false` through native Enter while retaining the row, focus and unsent draft.
The closed model trigger also exposes false. Direct execution of the loaded renderer on real
HTML/SVG DOM elements retains false ARIA values, updates true, and removes null/omitted values;
non-ARIA false remains omitted and the native disabled property remains false. The host process
stays up. Already loaded modules require a client refresh to adopt a framework edit.
