/** Host BFF entry and Loader shell for the Remote contribution assembly. */

export {
  ApiRemoteSessionNotFound,
  ApiRemoteSubagentSessionOwnership,
  apiRemoteSubagentOwnershipError,
  createApiRemoteAgentResolver,
  hasApiRemoteSubagentOwner,
  inspectApiRemoteSession,
} from './agent-lookup.js'
export { API_REMOTE_FORWARDED_EVENTS } from './remote-events.js'

/** Host plugin body; the selected contributions mount only in Client environments. */
export function apply() {}
