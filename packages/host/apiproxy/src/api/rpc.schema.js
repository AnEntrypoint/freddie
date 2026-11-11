function passthrough() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  }
}

export const clientRequestSchema = passthrough()

export const serverResponseSchema = passthrough()

export const serverRequestSchema = passthrough()

export const clientResponseSchema = passthrough()

export const rpcReceiptSchema = passthrough()
