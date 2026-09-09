/**
 * freddie-lsp's owned branded id: {@link LspProviderId}, the opaque identity a provider reserves on
 * `ctx.lsp`. The `Branded<B>` primitive lives in `@freddie/freddie-brand`; keeping the type and its
 * factory together here lets `index.js` re-export both under one name.
 * @module @freddie/freddie-lsp/brand
 */

/**
 * Brand a string as an {@link LspProviderId}. No validation — the registry rejects an empty id at
 * registration.
 * @param id - the provider's stable identifier.
 * @returns the same string, branded.
 */
export function LspProviderId(id) {
  return id
}
