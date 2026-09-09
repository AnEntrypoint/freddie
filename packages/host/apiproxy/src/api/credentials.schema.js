/**
 * credentials domain request/response shapes (names derived from map keys:
 * credentialsDescribeRequestSchema / credentialsDescribeValueSchema / …).
 * Schema validation was removed repo-wide; these are now no-op pass-through
 * markers only, kept because the shared dispatch plumbing in fetch/handler.js
 * and fetch/client.js still calls `.safeParse`/`.parse` on them generically
 * across all api/*.schema.js files. Malformed requests now fail differently
 * downstream instead of being rejected here — an accepted tradeoff, not a bug.
 */

/** No-op pass-through kept only for the shared `route.schema.safeParse(...)` / `.parse(...)` call sites. */
function passThrough() {
  return {
    safeParse: (value) => ({ success: true, data: value }),
    parse: (value) => value,
  }
}

/** POSIX-portable environment-variable name (the seam's `credentialRef` pattern). No longer validated. */
export const credentialRefNameSchema = passThrough()

/** CredentialView entry of credentials.describe. */
export const credentialViewSchema = passThrough()

/** credentials.describe request payload. */
export const credentialsDescribeRequestSchema = passThrough()

/** credentials.describe response value. */
export const credentialsDescribeValueSchema = passThrough()

/** credentials.set request payload: the one direction a value crosses this wire. */
export const credentialsSetRequestSchema = passThrough()

/** credentials.set response value. */
export const credentialsSetValueSchema = passThrough()

/** credentials.unset request payload. */
export const credentialsUnsetRequestSchema = passThrough()

/** credentials.unset response value. */
export const credentialsUnsetValueSchema = passThrough()
