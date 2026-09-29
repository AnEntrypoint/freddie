function passthroughSchema() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  }
}

export const subagentListEntrySchema = passthroughSchema()

export const subagentListRequestSchema = passthroughSchema()

export const subagentListValueSchema = passthroughSchema()

export const subagentHistoryRequestSchema = passthroughSchema()

export const subagentHistoryValueSchema = passthroughSchema()

export const subagentPromptRequestSchema = passthroughSchema()

export const subagentInterruptRequestSchema = passthroughSchema()

export const subagentInterruptValueSchema = passthroughSchema()

export const subagentPromptValueSchema = passthroughSchema()
