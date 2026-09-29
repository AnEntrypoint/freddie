function passthrough() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  }
}

export const rpcIdSchema = passthrough()

export const rpcErrorSchema = passthrough()

export function rpcResultSchema(_value) {
  return passthrough()
}


export const clientRequestSchema = passthrough()

export const serverResponseSchema = passthrough()

export const serverRequestSchema = passthrough()

export const clientResponseSchema = passthrough()

export const rpcMessageSchema = passthrough()

export const rpcReceiptSchema = passthrough()
