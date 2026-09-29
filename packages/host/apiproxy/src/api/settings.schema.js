const passthrough = { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) }

export const settingsSecretViewSchema = passthrough

export const settingsNamespaceViewSchema = passthrough

export const settingsDescribeRequestSchema = passthrough

export const settingsDescribeValueSchema = passthrough

export const settingsOpenDocumentRequestSchema = passthrough

export const settingsOpenDocumentValueSchema = passthrough

export const settingsUpdateRequestSchema = passthrough

export const settingsUpdateValueSchema = passthrough

export const settingsReplaceRequestSchema = passthrough

export const settingsPathOpSchema = passthrough

export const settingsMutateRequestSchema = passthrough

export const settingsMutateValueSchema = passthrough

export const settingsReplaceValueSchema = passthrough
