/**
 * host domain request/response shims (names derived from map keys).
 *
 * Zod schema validation has been removed repo-wide; these were all pure-validation
 * schemas (no .transform() reshaping), so each export below is now a no-op
 * pass-through that keeps the shared safeParse-style call sites in
 * ../fetch/handler.js and ../fetch/client.js working unchanged. Those two files
 * are consumed identically by every sibling *.schema.js module in this same
 * removal pass, so they are left untouched here rather than edited out from
 * under a parallel agent; malformed payloads simply flow through unchanged
 * (accepted tradeoff per the schema-validation removal decision).
 */

/** Pass-through shim: always reports success and returns the input unchanged. */
const passthrough = () => ({ safeParse: data => ({ success: true, data }), parse: data => data })

/** host.describe request payload (empty object literal). */
export const hostDescribeRequestSchema = passthrough()

/** host.describe response value. */
export const hostDescribeValueSchema = passthrough()

/** host.pickDirectory request payload (empty object literal). */
export const hostPickDirectoryRequestSchema = passthrough()

/** host.pickDirectory response value; null means the user cancelled. */
export const hostPickDirectoryValueSchema = passthrough()

/** Directory row shared by listing entries and breadcrumb crumbs. */
export const directoryEntrySchema = passthrough()

/** host.listDirectory request payload; an absent path lists the home directory. */
export const hostListDirectoryRequestSchema = passthrough()

/** host.listDirectory response value. */
export const hostListDirectoryValueSchema = passthrough()

/** host.createDirectory request payload: name must be one plain path segment. */
export const hostCreateDirectoryRequestSchema = passthrough()

/** host.createDirectory response value: the created directory's absolute path. */
export const hostCreateDirectoryValueSchema = passthrough()

/** host.openPath request payload. */
export const hostOpenPathRequestSchema = passthrough()

/** host.openPath response value. */
export const hostOpenPathValueSchema = passthrough()
