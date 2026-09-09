/**
 * settings domain request/response shapes (names derived from map keys: settingsDescribeRequestSchema /
 * settingsDescribeValueSchema / settingsUpdate* / settingsReplace*).
 *
 * Zod validation has been removed repo-wide; these were all pure-validation schemas with no
 * transform/refine reshaping, so each export below is now a no-op pass-through exposing the same
 * `.parse(x)` shape the generic dispatch tables in fetch/handler.js and fetch/client.js call by
 * name (`SCHEMA.parse(value)`), returning the value unchanged. Malformed requests now fail
 * differently downstream rather than being cleanly rejected here -- an accepted tradeoff.
 */

const passthrough = { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) }

/** One redacted secret slot. */
export const settingsSecretViewSchema = passthrough

/** SettingsNamespaceView row of settings.describe and the write responses. */
export const settingsNamespaceViewSchema = passthrough

/** settings.describe request payload. */
export const settingsDescribeRequestSchema = passthrough

/** settings.describe response value. */
export const settingsDescribeValueSchema = passthrough

/** settings.openDocument request payload. */
export const settingsOpenDocumentRequestSchema = passthrough

/** settings.openDocument response value. */
export const settingsOpenDocumentValueSchema = passthrough

/** settings.update request payload. */
export const settingsUpdateRequestSchema = passthrough

/** settings.update response value: the namespace's new redacted view. */
export const settingsUpdateValueSchema = passthrough

/** settings.replace request payload. */
export const settingsReplaceRequestSchema = passthrough

/** One path-addressed edit of settings.mutate. */
export const settingsPathOpSchema = passthrough

/** settings.mutate request payload. */
export const settingsMutateRequestSchema = passthrough

/** settings.mutate response value: the namespace's new redacted view. */
export const settingsMutateValueSchema = passthrough

/** settings.replace response value. */
export const settingsReplaceValueSchema = passthrough
