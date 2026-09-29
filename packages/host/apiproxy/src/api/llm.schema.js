const passthrough = () => ({
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
})

export const configurableProviderViewSchema = passthrough()

export const llmProvidersRequestSchema = passthrough()

export const llmProvidersValueSchema = passthrough()

export const llmModelsRequestSchema = passthrough()

export const llmModelsValueSchema = passthrough()

export const discoveredModelViewSchema = passthrough()

export const llmDiscoverModelsRequestSchema = passthrough()

export const llmDiscoverModelsValueSchema = passthrough()
