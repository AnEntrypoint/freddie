const passthrough = () => ({ parse: value => value, safeParse: value => ({ success: true, data: value }) })

export const goalRefSchema = passthrough()

export const goalCreateRequestSchema = passthrough()

export const goalCreateValueSchema = passthrough()

export const goalEditRequestSchema = passthrough()

export const goalEditValueSchema = passthrough()

export const goalPauseRequestSchema = passthrough()

export const goalPauseValueSchema = passthrough()

export const goalResumeRequestSchema = passthrough()

export const goalResumeValueSchema = passthrough()

export const goalCompleteRequestSchema = passthrough()

export const goalCompleteValueSchema = passthrough()

export const goalClearRequestSchema = passthrough()

export const goalClearValueSchema = passthrough()
