import { _deepseek_ai_dsh_commands_commands_execute_parameter_0$schema, _deepseek_ai_dsh_commands_commands_execute_parameter_1$schema, _deepseek_ai_dsh_commands_commands_execute_parameter_2$schema, _deepseek_ai_dsh_commands_commands_execute_result$schema, _deepseek_ai_dsh_commands_commands_list_result$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-commands',
  descriptors: [
    {
      id: '@freddie/freddie-commands#commands/execute',
      service: 'commands',
      namespace: 'commands',
      method: 'execute',
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
            schema: _deepseek_ai_dsh_commands_commands_execute_parameter_0$schema,
          },
        },
        {
          name: 'line',
          wire: 'line',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-commands#commands/execute:line',
            schema: _deepseek_ai_dsh_commands_commands_execute_parameter_1$schema,
          },
        },
        {
          name: 'images',
          wire: 'images',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-commands#commands/execute:images',
            schema: _deepseek_ai_dsh_commands_commands_execute_parameter_2$schema,
          },
        },
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-commands#commands/execute:result',
        schema: _deepseek_ai_dsh_commands_commands_execute_result$schema,
      },
      sourceLocation: {"file":"packages/interaction/commands/src/index.ts","line":329,"column":9},
    },
    {
      id: '@freddie/freddie-commands#commands/list',
      service: 'commands',
      namespace: 'commands',
      method: 'list',
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
            schema: _deepseek_ai_dsh_commands_commands_execute_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-commands#commands/list:result',
        schema: _deepseek_ai_dsh_commands_commands_list_result$schema,
      },
      sourceLocation: {"file":"packages/interaction/commands/src/index.ts","line":285,"column":3},
    },
  ],
}

export default TYPERT_REMOTE
