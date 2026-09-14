# Agent Note: WebJSX DOM attribute serialization

Status: implemented

## Problem

WebJSX assigned non-string values for unknown HTML keys as JavaScript expandos. Client features use boolean and numeric data attributes for CSS state, DOM lookup, and ARIA metadata, so these values were absent from the rendered DOM. The Trajectory ledger hid until its data-scroll-ready attribute existed and its custom-element hosts defaulted to inline layout.

## Decision

`framework/webjsx/src/attributes.js` writes unknown HTML values with `setAttribute(String(value))` and removes attributes for false, null, and undefined. DOM properties retain property assignment and SVG remains attribute-only. The browser vendor copy mirrors the framework source, while the vendor route treats WebJSX as a live workspace package. Trajectory custom elements declare bounded flex layout, defer Virtualizer callbacks beyond the active render, and mark live records ready once table rows exist.

## Alternatives considered

**Keep the expando fallback** makes browser-visible state depend on the JavaScript object rather than the DOM, breaking CSS selectors, accessibility metadata, and generic DOM tooling.

**Force the ledger visible in CSS** conceals readiness failures and leaves record state, scroll lookup, and ARIA metadata broken.

## Consequences

The real Trajectory ledger exposes visible rows with data-scroll-ready, data-record-index, and aria-rowindex attributes. Future framework attribute changes must update the vendored WebJSX copy or the browser will keep serving stale behavior.
