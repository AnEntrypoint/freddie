/**
 * Project the selected durable session title into the browser title.
 * Converted from a React `useEffect`-based component to a plain imperative
 * function: no mount/unmount lifecycle exists at this call site (app.tsx
 * calls it directly, once, from inside a reactive read that re-invokes on
 * every session-list change — see app.tsx), so the effect body becomes a
 * direct side-effecting statement instead of an effect with a cleanup.
 */
const DEFAULT_CLIENT_TITLE = 'freddie'

/** Set the browser document title from the selected session's title, or the product title when none is selected. */
export function applyDocumentTitle(title) {
  const productTitle = process.env.FREDDIE_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE
  document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
}
