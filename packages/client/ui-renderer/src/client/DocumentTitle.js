const DEFAULT_CLIENT_TITLE = 'freddie'

export function applyDocumentTitle(title) {
  const productTitle = process.env.FREDDIE_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE
  document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
}
