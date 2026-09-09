/**
 * agent-presets domain request/response shape markers (names derived from map keys:
 * agentPresetListRequestSchema / agentPresetListValueSchema).
 *
 * Zod validation has been removed repo-wide: these are no longer zod schemas.
 * None of this file's schemas did any transform/reshaping (pure validation only),
 * so each export is now a plain pass-through object exposing the same `.parse(x)`
 * call shape that fetch/client.js and fetch/handler.js already call generically
 * across every apiproxy schema file. Malformed requests/responses now fail
 * differently downstream instead of being rejected here — an accepted tradeoff.
 */

/** Pass-through "schema": returns the value unchanged, no validation. */
const passthrough = () => ({ parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) })

/** AgentPresetEntry row of agentPreset.list. */
export const agentPresetEntrySchema = passthrough()

/** agentPreset.list request payload. */
export const agentPresetListRequestSchema = passthrough()

/** agentPreset.list response value. */
export const agentPresetListValueSchema = passthrough()

/** agentPreset.select request payload. */
export const agentPresetSelectRequestSchema = passthrough()

/** agentPreset.select response value. */
export const agentPresetSelectValueSchema = passthrough()

/** agentPreset.read request payload. */
export const agentPresetReadRequestSchema = passthrough()

/** agentPreset.read response value. */
export const agentPresetReadValueSchema = passthrough()

/** agentPreset.copy request payload. */
export const agentPresetCopyRequestSchema = passthrough()

/** agentPreset.copy response value. */
export const agentPresetCopyValueSchema = passthrough()

/** agentPreset.openDocument request payload. */
export const agentPresetOpenDocumentRequestSchema = passthrough()

/** agentPreset.openDocument response value. */
export const agentPresetOpenDocumentValueSchema = passthrough()

/** agentPreset.remove request payload. */
export const agentPresetRemoveRequestSchema = passthrough()

/** agentPreset.remove response value. */
export const agentPresetRemoveValueSchema = passthrough()
