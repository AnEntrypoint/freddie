import { z } from 'zod'

export const JsonValueRemoteCodec$schema = z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_parameter_0$schema = z.intersection(z.string(), z.unknown())
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_getClientCode_result$schema = z.object({
  'code': z.string(),
  'name': z.string(),
  'pluginId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
  'pluginRunId': z.intersection(z.string(), z.unknown()),
})
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_inventory_result$schema = z.array(z.object({
  'pluginId': z.intersection(z.string(), z.unknown()),
  'agentId': z.intersection(z.string(), z.unknown()),
  'packages': z.array(z.object({
  'packageId': z.intersection(z.string(), z.unknown()),
  'name': z.string(),
  'purpose': z.string(),
  'hasHostHalf': z.boolean(),
  'hasClientHalf': z.boolean(),
})),
  'currentPackageId': z.intersection(z.string(), z.unknown()).optional(),
  'nextPackageId': z.intersection(z.string(), z.unknown()).optional(),
  'activeRun': z.object({
  'pluginRunId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
}).optional(),
  'latestRun': z.object({
  'pluginRunId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
  'mode': z.union([z.literal("run"), z.literal("update")]),
  'status': z.union([z.literal("rejected"), z.literal("awaiting-approval"), z.literal("running"), z.literal("cancelled"), z.literal("starting-host"), z.literal("client-pending"), z.literal("waiting"), z.literal("failed"), z.literal("stopped")]),
  'approvalRequestId': z.intersection(z.string(), z.unknown()).optional(),
  'requiresApproval': z.boolean().optional(),
  'host': z.object({
  'status': z.union([z.literal("running"), z.literal("waiting"), z.literal("failed"), z.literal("stopped"), z.literal("absent"), z.literal("pending")]),
  'waitingFor': z.array(z.string()),
  'error': z.string().optional(),
}),
  'client': z.object({
  'status': z.union([z.literal("running"), z.literal("waiting"), z.literal("failed"), z.literal("stopped"), z.literal("absent"), z.literal("pending")]),
  'waitingFor': z.array(z.string()),
  'error': z.string().optional(),
}),
  'error': z.object({
  'phase': z.union([z.literal("approval"), z.literal("host-load"), z.literal("host-apply"), z.literal("client-load"), z.literal("client-apply"), z.literal("client-render")]),
  'message': z.string(),
  'stack': z.string().optional(),
  'pluginId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
  'pluginRunId': z.intersection(z.string(), z.unknown()),
}).optional(),
}).optional(),
}))
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_2$schema = z.string()
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_parameter_3$schema = z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_invoke_result$schema = z.union([z.object({
  'ok': z.literal(true),
  'value': z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))]),
}), z.intersection(z.object({
  'ok': z.literal(false),
  'code': z.union([z.literal("plugin-not-running"), z.literal("stale-run"), z.literal("method-not-found"), z.literal("handler-error")]),
}), z.object({
  'message': z.string(),
  'stack': z.string().optional(),
}))])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_parameter_3$schema = z.object({
  'message': z.string(),
  'stack': z.string().optional(),
})
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportClientGuardFailure_result$schema = z.literal(null)
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_reportRenderFailure_parameter_3$schema = z.object({
  'slot': z.string(),
  'message': z.string(),
  'stack': z.string().optional(),
  'abdicated': z.boolean(),
})
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_parameter_2$schema = z.union([z.object({
  'ok': z.literal(true),
  'data': z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))]),
}), z.object({
  'ok': z.literal(false),
  'reason': z.union([z.literal("cancelled"), z.literal("provider-missing"), z.literal("method-missing"), z.literal("invalid-input"), z.literal("provider-error")]),
  'message': z.string(),
})])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveInspectQuery_result$schema = z.object({
  'accepted': z.boolean(),
})
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_resolveRequestRun_parameter_1$schema = z.union([z.object({
  'ok': z.literal(true),
  'pluginRunId': z.intersection(z.string(), z.unknown()),
  'waitingFor': z.array(z.string()).optional(),
}), z.object({
  'ok': z.literal(false),
  'reason': z.union([z.literal("rejected"), z.literal("host-half-failed"), z.literal("client-half-failed")]),
  'pluginRunId': z.intersection(z.string(), z.unknown()).optional(),
  'startedHere': z.boolean().optional(),
  'message': z.string().optional(),
  'stack': z.string().optional(),
})])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_3$schema = z.union([z.literal("run"), z.literal("update")])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_4$schema = z.union([z.literal(null), z.intersection(z.string(), z.unknown())])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_parameter_5$schema = z.boolean()
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_runHostHalf_result$schema = z.union([z.object({
  'ok': z.literal(true),
  'pluginId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
  'pluginRunId': z.intersection(z.string(), z.unknown()),
  'waitingFor': z.array(z.string()),
  'startedHere': z.boolean(),
}), z.intersection(z.object({
  'ok': z.literal(false),
}), z.object({
  'message': z.string(),
  'stack': z.string().optional(),
}))])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_settleUserRun_result$schema = z.union([z.object({
  'ok': z.literal(true),
  'status': z.union([z.literal("awaiting-approval"), z.literal("starting"), z.literal("running")]),
  'pluginId': z.intersection(z.string(), z.unknown()),
  'packageId': z.intersection(z.string(), z.unknown()),
  'pluginRunId': z.intersection(z.string(), z.unknown()),
  'waitingFor': z.array(z.string()),
  'clientWaitingFor': z.array(z.string()).optional(),
  'currentPackageId': z.intersection(z.string(), z.unknown()).optional(),
  'nextPackageId': z.intersection(z.string(), z.unknown()).optional(),
  'mode': z.union([z.literal("run"), z.literal("update")]),
}), z.object({
  'ok': z.literal(false),
  'reason': z.union([z.literal("plugin-missing"), z.literal("rejected"), z.literal("host-half-failed"), z.literal("client-half-failed"), z.literal("package-missing"), z.literal("invalid-mode"), z.literal("transition-in-flight"), z.literal("cancelled"), z.literal("not-running")]),
  'message': z.string(),
  'stack': z.string().optional(),
})])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_stopFromPanel_result$schema = z.union([z.object({
  'ok': z.literal(true),
}), z.object({
  'ok': z.literal(false),
  'reason': z.union([z.literal("plugin-missing"), z.literal("not-running")]),
  'message': z.string(),
})])
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_syncInspectManifest_parameter_0$schema = z.array(z.object({
  'id': z.string(),
  'description': z.string(),
  'methods': z.array(z.object({
  'name': z.string(),
  'description': z.string(),
  'inputSchema': z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))]),
  'outputSchema': z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => JsonValueRemoteCodec$schema)), z.record(z.string(), z.lazy(() => JsonValueRemoteCodec$schema))]),
})),
}))
export const _deepseek_ai_dsh_cordis_host_runner_dynamicCordisRunner_undefineFromPanel_result$schema = z.union([z.object({
  'ok': z.literal(true),
  'wasRunning': z.boolean(),
}), z.object({
  'ok': z.literal(false),
  'reason': z.literal("plugin-missing"),
  'message': z.string(),
})])
