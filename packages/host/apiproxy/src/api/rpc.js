export function RpcId(id) {
  return id
}

export function transportError(error) {
  return {
    ok: false,
    error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
  }
}
