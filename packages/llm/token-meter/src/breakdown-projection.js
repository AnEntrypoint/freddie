import { canonicalHeader } from '@freddie/freddie-session'
import { estimateSystemTokens, estimateToolsTokens } from './estimate.js'
import { foldSurfaceProjection } from './surface-projection.js'

export const contextBreakdownProjectionDefinition = {
  key: 'contextBreakdown',
  stateVersion: 2,
  init: () => ({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }),
  apply: (state, event) => {
    const fold = foldSurfaceProjection(state.claim, event)
    let systemTokens = state.systemTokens
    let toolsTokens = state.toolsTokens
    if (event.type === 'request/header') {
      const header = canonicalHeader(event.data.header)
      systemTokens = estimateSystemTokens(header)
      toolsTokens = estimateToolsTokens(header)
    }
    if (systemTokens === state.systemTokens
      && toolsTokens === state.toolsTokens
      && fold.deltaTokens === 0
      && fold.claim === undefined
      && state.claim === undefined) return state
    return {
      systemTokens,
      toolsTokens,
      messageTokens: state.messageTokens + fold.deltaTokens,
      ...fold.claim === undefined ? {} : { claim: fold.claim },
    }
  },
  wire: {
    view: ({ systemTokens, toolsTokens, messageTokens }) => ({ systemTokens, toolsTokens, messageTokens }),
  },
}
