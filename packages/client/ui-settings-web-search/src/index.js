/**
 * Web-search settings card, node half. The empty apply exists so the plugin
 * holds a Loader row the client module system serves the browser half for.
 *
 * The `web-search-deepseek` namespace this card edits is registered by the
 * search provider that owns that configuration
 * (`@freddie/freddie-web-search-deepseek`), so this package registers no
 * namespace of its own — a deployment that composes no such provider serves no
 * section, and the Plugins page dispatches no card.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply() {}
