function passThrough() {
  return {
    safeParse: (value) => ({ success: true, data: value }),
    parse: (value) => value,
  }
}

export const credentialRefNameSchema = passThrough()

export const credentialViewSchema = passThrough()

export const credentialsDescribeRequestSchema = passThrough()

export const credentialsDescribeValueSchema = passThrough()

export const credentialsSetRequestSchema = passThrough()

export const credentialsSetValueSchema = passThrough()

export const credentialsUnsetRequestSchema = passThrough()

export const credentialsUnsetValueSchema = passThrough()
