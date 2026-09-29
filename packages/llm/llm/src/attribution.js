/**
 * Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
 * adapters from drifting. See
 * `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
 *
 * App-attribution vocabulary for provider requests.
 * @module @freddie/freddie-llm/attribution
 */

import { createRequire } from 'node:module'

const { version } = createRequire(import.meta.url)('../package.json')

/**
 * Static public application identity sent to LLM providers. Every field is a
 * public product fact, safe on every request: no secrets, local paths,
 * session ids, prompt text, or per-user identifiers belong here, and nothing
 * per-request may influence the values.
 * @typedef {object} AppIdentity
 * @property {string} product - `User-Agent` product token (lowercase, hyphenated).
 * @property {string} version - product version; sourced from package metadata.
 * @property {string} url - repository home URL of the app, used as the `User-Agent` comment.
 */

/**
 * The harness's own identity: the default every adapter sends. Deployments
 * that need a white-label identity pass their own {@link AppIdentity} to
 * {@link attributionHeaders} — omission falls back to this default; nothing
 * can suppress attribution entirely.
 */
export const APP_IDENTITY = {
  product: 'freddie',
  version,
  url: 'https://github.com/lanmower/freddie',
}

/**
 * The standard `User-Agent` value: `product/version (+url)`. The
 * parenthesized `+url` comment is the conventional self-identification form
 * (RFC 9110 §10.1.5 product + comment syntax).
 * @param identity - the identity to render; defaults to {@link APP_IDENTITY}.
 * @returns the ready-to-send header value.
 */
export function userAgent(identity = APP_IDENTITY) {
  return `${identity.product}/${identity.version} (+${identity.url})`
}

/**
 * Build the attribution headers an adapter must send on every provider
 * request. Header names are lowercase (HTTP field names are case-insensitive
 * on the wire).
 * @param identity - the identity to send; defaults to {@link APP_IDENTITY} — omission cannot suppress attribution.
 * @returns headers to merge into the provider request (currently just `user-agent`).
 */
export function attributionHeaders(identity = APP_IDENTITY) {
  return { 'user-agent': userAgent(identity) }
}
