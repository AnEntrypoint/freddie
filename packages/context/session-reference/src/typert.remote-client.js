import { _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_0$schema, _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_1$schema, _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_result$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-session-reference',
  descriptors: [
    {
      id: '@freddie/freddie-session-reference#sessionReferenceResolver/candidates',
      service: 'sessionReferenceResolver',
      namespace: 'sessionReferenceResolver',
      method: 'candidates',
      implementation: 'remoteExportCandidates',
      invocation: { kind: 'direct' },
      scope: {
        context: 'agent',
        wire: 'agentId',
      },
      parameters: [
        {
          name: 'agent',
          wire: 'agentId',
          source: 'lookup',
          lookup: 'agent',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-session/types#SessionId',
            schema: _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_0$schema,
          },
        },
        {
          name: 'query',
          wire: 'query',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-session-reference#sessionReferenceResolver/candidates:query',
            schema: _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_parameter_1$schema,
          },
        },
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-session-reference#sessionReferenceResolver/candidates:result',
        schema: _deepseek_ai_dsh_session_reference_sessionReferenceResolver_candidates_result$schema,
      },
      sourceLocation: {"file":"packages/context/session-reference/src/index.ts","line":218,"column":9},
    },
  ],
}

export default TYPERT_REMOTE
