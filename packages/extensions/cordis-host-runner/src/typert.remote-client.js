import { _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_inventory_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_2$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_3$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_parameter_3$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportRenderFailure_parameter_3$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_parameter_2$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveRequestRun_parameter_1$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_3$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_4$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_5$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_settleUserRun_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_stopFromPanel_result$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_syncInspectManifest_parameter_0$schema, _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_undefineFromPanel_result$schema } from './typert.schemas.js'

export const TYPERT_REMOTE = {
  package: '@freddie/freddie-cordis-host-runner',
  descriptors: [
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/getClientCode',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'getClientCode',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginRunId',
          wire: 'pluginRunId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginRunId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisClientSource',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":384,"column":3},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/inventory',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'inventory',
      invocation: { kind: 'direct' },
      parameters: [
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/inventory:result',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_inventory_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":525,"column":3},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/invoke',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'invoke',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginRunId',
          wire: 'pluginRunId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginRunId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'method',
          wire: 'method',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/invoke:method',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_2$schema,
          },
        },
        {
          name: 'args',
          wire: 'args',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-session/types#JsonValue',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_3$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisInvokeResult',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":741,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/reportClientGuardFailure',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'reportClientGuardFailure',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginRunId',
          wire: 'pluginRunId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginRunId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'failure',
          wire: 'failure',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisErrorDetails',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_parameter_3$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/reportClientGuardFailure:result',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":718,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/reportRenderFailure',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'reportRenderFailure',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginRunId',
          wire: 'pluginRunId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginRunId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'failure',
          wire: 'failure',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisRenderFailure',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportRenderFailure_parameter_3$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/reportRenderFailure:result',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":684,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/resolveInspectQuery',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'resolveInspectQuery',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'requestId',
          wire: 'requestId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisInspectRequestId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'resolution',
          wire: 'resolution',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisInspectQueryResolution',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_parameter_2$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisInspectResolveAck',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":511,"column":3},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/resolveRequestRun',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'resolveRequestRun',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'requestId',
          wire: 'requestId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#ApprovalRequestId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'resolution',
          wire: 'resolution',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisRunResolution',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveRequestRun_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisResolveAck',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":413,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/runHostHalf',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'runHostHalf',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'packageId',
          wire: 'packageId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPackageId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'mode',
          wire: 'mode',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicRunMode',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_3$schema,
          },
        },
        {
          name: 'requestId',
          wire: 'requestId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/runHostHalf:requestId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_4$schema,
          },
        },
        {
          name: 'approveFutureVersions',
          wire: 'approveFutureVersions',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/runHostHalf:approveFutureVersions',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_5$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisHostHalfResult',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":325,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/settleUserRun',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'settleUserRun',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'resolution',
          wire: 'resolution',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisRunResolution',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveRequestRun_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisRunResponse',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_settleUserRun_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":438,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/stopFromPanel',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'stopFromPanel',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisStopResponse',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_stopFromPanel_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":480,"column":9},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/syncInspectManifest',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'syncInspectManifest',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'providers',
          wire: 'providers',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/syncInspectManifest:providers',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_syncInspectManifest_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/syncInspectManifest:result',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":498,"column":3},
    },
    {
      id: '@freddie/freddie-cordis-host-runner#dynamicCordisRunner/undefineFromPanel',
      service: 'dynamicCordisRunner',
      namespace: 'dynamicCordisRunner',
      method: 'undefineFromPanel',
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
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
        {
          name: 'pluginId',
          wire: 'pluginId',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@freddie/freddie-cordis-host-runner/types#CordisDynamicPluginId',
            schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@freddie/freddie-cordis-host-runner/types#DynamicCordisUndefineReceipt',
        schema: _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_undefineFromPanel_result$schema,
      },
      sourceLocation: {"file":"packages/extensions/cordis-host-runner/src/index.ts","line":227,"column":9},
    },
  ],
}

export default TYPERT_REMOTE
