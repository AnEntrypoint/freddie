const passthrough = () => ({ parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) })

export const agentPresetEntrySchema = passthrough()

export const agentPresetListRequestSchema = passthrough()

export const agentPresetListValueSchema = passthrough()

export const agentPresetSelectRequestSchema = passthrough()

export const agentPresetSelectValueSchema = passthrough()

export const agentPresetReadRequestSchema = passthrough()

export const agentPresetReadValueSchema = passthrough()

export const agentPresetCopyRequestSchema = passthrough()

export const agentPresetCopyValueSchema = passthrough()

export const agentPresetOpenDocumentRequestSchema = passthrough()

export const agentPresetOpenDocumentValueSchema = passthrough()

export const agentPresetRemoveRequestSchema = passthrough()

export const agentPresetRemoveValueSchema = passthrough()
