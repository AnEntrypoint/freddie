import { _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_0$schema, _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_1$schema, _deepseek_ai_dsh_file_reference_fileReferences_list_result$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-file-reference',
  descriptors: [
    {
      id: '@freddie/freddie-file-reference#fileReferences/list',
      service: 'fileReferences',
      namespace: 'fileReferences',
      method: 'list',
      implementation: 'remoteExportList',
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
            schema: _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_0$schema,
          },
        },
        {
          name: 'query',
          wire: 'query',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-file-reference#fileReferences/list:query',
            schema: _deepseek_ai_dsh_file_reference_fileReferences_list_parameter_1$schema,
          },
        },
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-file-reference#fileReferences/list:result',
        schema: _deepseek_ai_dsh_file_reference_fileReferences_list_result$schema,
      },
      sourceLocation: {"file":"packages/context/file-reference/src/index.ts","line":54,"column":3},
    },
  ],
}

export default TYPERT_REMOTE
