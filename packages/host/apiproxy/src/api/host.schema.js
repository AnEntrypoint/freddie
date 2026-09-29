const passthrough = () => ({ safeParse: data => ({ success: true, data }), parse: data => data })

export const hostDescribeRequestSchema = passthrough()

export const hostDescribeValueSchema = passthrough()

export const hostPickDirectoryRequestSchema = passthrough()

export const hostPickDirectoryValueSchema = passthrough()

export const directoryEntrySchema = passthrough()

export const hostListDirectoryRequestSchema = passthrough()

export const hostListDirectoryValueSchema = passthrough()

export const hostCreateDirectoryRequestSchema = passthrough()

export const hostCreateDirectoryValueSchema = passthrough()

export const hostOpenPathRequestSchema = passthrough()

export const hostOpenPathValueSchema = passthrough()
