/**
 * Browser conversation plugin. `contract/` is the shared type boundary
 * between the independently implemented skeleton and chat domains; `apply.js`
 * owns their slot assembly.
 */
export { apply, inject } from './apply.js'
export { ConversationController } from './service.js'
// Export discipline: packages/client/AGENTS.md.
