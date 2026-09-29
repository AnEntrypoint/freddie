/**
 * Wire-safe authorization types, free of cordis/service imports so a Client
 * compilation face reads exactly the signature the Host emits instead of
 * restating it. Types only — no runtime code.
 *
 * The credential-record union below mirrors the one the credentials seam
 * documents; it is restated here because that package's own `./types` module
 * carries no body yet.
 *
 * @module @freddie/freddie-authorization/types
 */

/**
 * One way a flow can obtain its credential, named by the flow that offers it.
 * @typedef {object} AuthorizationMethod
 * @property {string} id Flow-owned identifier, echoed back when a caller picks this method.
 * @property {string} label User-facing label for a picker.
 */

/**
 * A running flow's report to whoever is watching it. Never carries a secret.
 * @typedef {object} AuthorizationNotice
 * @property {string} message What is happening, or what the human must do next.
 * @property {string} [url] A page the human must open to continue.
 * @property {string} [code] A short code the human must enter on that page.
 */

/**
 * One choice offered by a `select` prompt.
 * @typedef {object} AuthorizationPromptOption
 * @property {string} id Value returned when this option is chosen.
 * @property {string} label User-facing label.
 * @property {string} [description] Optional extra context rendered by capable surfaces.
 */

/**
 * A question a flow must have answered before it can continue. `secret`
 * differs from `text` only in presentation — a surface masks it and keeps it
 * out of logs — and `select` answers with the chosen option's `id`.
 * @typedef {object} AuthorizationTextPrompt
 * @property {AbortSignal} [signal] Withdraws this prompt alone, leaving the flow running: a flow racing a typed code against a browser callback aborts the losing prompt here, while the whole authorization is cancelled through the request's signal instead.
 * @property {'text'} kind
 * @property {string} message What to ask.
 * @property {string} [placeholder]
 */

/**
 * @typedef {object} AuthorizationSecretPrompt
 * @property {AbortSignal} [signal] Withdraws this prompt alone, leaving the flow running; see {@link AuthorizationTextPrompt}.
 * @property {'secret'} kind
 * @property {string} message What to ask.
 * @property {string} [placeholder]
 */

/**
 * @typedef {object} AuthorizationSelectPrompt
 * @property {AbortSignal} [signal] Withdraws this prompt alone, leaving the flow running; see {@link AuthorizationTextPrompt}.
 * @property {'select'} kind
 * @property {string} message What to ask.
 * @property {readonly AuthorizationPromptOption[]} options The choices, in the order the flow prefers.
 */

/** @typedef {AuthorizationTextPrompt | AuthorizationSecretPrompt | AuthorizationSelectPrompt} AuthorizationPrompt */

/**
 * One stored credential record carrying literal key material.
 * @typedef {object} ApiKeyRecord
 * @property {'api-key'} kind
 * @property {string} [key]
 * @property {Readonly<Record<string, string>>} [env]
 */

/**
 * One stored credential record carrying an opaque authorization grant.
 * @typedef {object} GrantRecord
 * @property {'grant'} kind
 * @property {unknown} payload
 */

/** @typedef {ApiKeyRecord | GrantRecord} CredentialRecord */

/**
 * How one authorization attempt ended, as its own caller sees it.
 * @typedef {'authorized' | 'cancelled'} AuthorizationStatus
 */

/**
 * How one attempt ended, as an onlooker sees it. A failure reaches its caller
 * as a thrown error rather than an outcome, so `failed` exists only here — on
 * the event stream, where a watcher that did not start the attempt has no
 * other way to tell a refusal from a breakage.
 * @typedef {AuthorizationStatus | 'failed'} AuthorizationSettlement
 */

/**
 * The result of one `begin()` attempt.
 * @typedef {object} AuthorizationOutcome
 * @property {AuthorizationStatus} status `authorized` once the record is committed and observed; `cancelled` when the human or caller withdrew.
 */

/**
 * A registered flow as a surface sees it: what it authorizes and whether it is busy.
 * @typedef {object} AuthorizationEntry
 * @property {string} key The credential record this flow writes.
 * @property {string} label User-facing name of what is being authorized.
 * @property {readonly AuthorizationMethod[]} methods The methods this flow offers, most preferred first.
 * @property {boolean} inFlight Whether an attempt for this key is running right now.
 */

/**
 * What a running flow is given to talk to the human. Every member is scoped to
 * one attempt: the flow neither knows nor chooses which surface is listening.
 * @typedef {object} AuthorizationSession
 * @property {string} method The method id the caller picked, always one this flow declared.
 * @property {AbortSignal} signal Aborted when the caller withdraws, or when `cancel()` is called for this key.
 * @property {(record: CredentialRecord) => Promise<void>} commit Commit a record while rejecting cancelled attempts. Once admitted, cancellation waits for completion.
 * @property {(notice: AuthorizationNotice) => void} notify Report progress, or tell the human what to do next. Fire-and-forget: a surface that cannot render a notice must not stall the flow.
 * @property {(prompt: AuthorizationPrompt) => Promise<string>} prompt Ask the human a question the flow cannot answer for itself; resolves with the typed text or the chosen option's id, rejects when the human declines or the prompt's own signal withdraws it.
 */

/**
 * A plugin's knowledge of how to obtain one credential. The flow owns the
 * write: `run()` resolving means the record for `key` is committed through
 * `ctx.credentials` during that run, which the seam confirms — a commit
 * observed within the attempt, still present after it — before reporting
 * success. Committing inside the flow is what lets a library that persists
 * through its own store adapter stay the single writer instead of being copied
 * back out and written twice.
 * @typedef {object} AuthorizationFlow
 * @property {string} key The credential record this flow writes. Its scope names the owning plugin.
 * @property {string} label User-facing name of what is being authorized.
 * @property {readonly AuthorizationMethod[]} methods The methods offered, most preferred first; a caller naming none gets the first.
 */

/**
 * The surface half of one attempt. Supplied with the request rather than
 * registered, because the caller that starts an authorization is the one that
 * can talk to the human about it: prompts reach exactly the page that asked,
 * and a headless caller supplies an interaction that declines.
 * @typedef {object} AuthorizationInteraction
 * @property {(notice: AuthorizationNotice) => void} notify Render a notice from the running flow.
 * @property {(prompt: AuthorizationPrompt) => Promise<string>} prompt Put a question to the human and wait; resolves with the typed text or the chosen option's id, rejects with {@link import('./index.js').AuthorizationDeclinedError} when the human declines — any other rejection reads as the surface failing, not as an answer.
 */

/**
 * One request to authorize a key.
 * @typedef {object} AuthorizationRequest
 * @property {string} key The credential record to authorize; a flow must be registered for it.
 * @property {string} [method] Which of the flow's methods to run. Defaults to the flow's first.
 * @property {AuthorizationInteraction} interaction The surface that will render this attempt's notices and prompts.
 * @property {AbortSignal} [signal] Withdraws the whole attempt.
 */
