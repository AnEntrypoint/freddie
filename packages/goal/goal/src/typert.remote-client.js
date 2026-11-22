import { _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema, _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema, _deepseek_ai_dsh_goal_goals_complete_result$schema, _deepseek_ai_dsh_goal_goals_create_parameter_1$schema, _deepseek_ai_dsh_goal_goals_create_result$schema, _deepseek_ai_dsh_goal_goals_edit_parameter_2$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-goal',
  descriptors: [
    {
      id: '@freddie/freddie-goal#goals/clear',
      service: 'goals',
      namespace: 'goals',
      method: 'clear',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'ref',
          wire: 'ref',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#GoalRef',
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#GoalRef',
        schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":377,"column":3},
    },
    {
      id: '@freddie/freddie-goal#goals/complete',
      service: 'goals',
      namespace: 'goals',
      method: 'complete',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'ref',
          wire: 'ref',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#GoalRef',
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#GoalView',
        schema: _deepseek_ai_dsh_goal_goals_complete_result$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":337,"column":3},
    },
    {
      id: '@freddie/freddie-goal#goals/create',
      service: 'goals',
      namespace: 'goals',
      method: 'create',
      implementation: 'remoteExportCreate',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#CreateGoalRequest',
            schema: _deepseek_ai_dsh_goal_goals_create_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#CreateGoalResult',
        schema: _deepseek_ai_dsh_goal_goals_create_result$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":586,"column":3},
    },
    {
      id: '@freddie/freddie-goal#goals/edit',
      service: 'goals',
      namespace: 'goals',
      method: 'edit',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'ref',
          wire: 'ref',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#GoalRef',
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
          },
        },
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#EditGoalRequest',
            schema: _deepseek_ai_dsh_goal_goals_edit_parameter_2$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#GoalView',
        schema: _deepseek_ai_dsh_goal_goals_complete_result$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":277,"column":3},
    },
    {
      id: '@freddie/freddie-goal#goals/pause',
      service: 'goals',
      namespace: 'goals',
      method: 'pause',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'ref',
          wire: 'ref',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#GoalRef',
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#GoalView',
        schema: _deepseek_ai_dsh_goal_goals_complete_result$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":299,"column":3},
    },
    {
      id: '@freddie/freddie-goal#goals/resume',
      service: 'goals',
      namespace: 'goals',
      method: 'resume',
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
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_0$schema,
          },
        },
        {
          name: 'ref',
          wire: 'ref',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-goal/client#GoalRef',
            schema: _deepseek_ai_dsh_goal_goals_clear_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-goal/client#GoalView',
        schema: _deepseek_ai_dsh_goal_goals_complete_result$schema,
      },
      sourceLocation: {"file":"packages/goal/goal/src/index.ts","line":311,"column":3},
    },
  ],
}

export default TYPERT_REMOTE
