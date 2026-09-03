// Thin re-export entrypoint. Split (mechanical, no behavior change) from a
// single 340-line file into three focused modules per AGENTS.md's 200-line
// vertical-slice cap:
//   - env-scope.js: envVarAllowed / scrubEnv / makeScopedEnvReader
//   - pii-scan.js: scanForPII / enforcePII
//   - resource-enforcement.js: path/host allow checks, withResourceEnforcement, readManifestResources
// Every symbol previously exported from this path remains importable from
// this same path.
export { envVarAllowed, scrubEnv, makeScopedEnvReader } from './env-scope.js'
export { scanForPII, enforcePII } from './pii-scan.js'
export { withResourceEnforcement, readManifestResources } from './resource-enforcement.js'
