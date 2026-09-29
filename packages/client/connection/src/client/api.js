export {
  RpcId,
  SESSION_SEARCH_RESULT_LIMIT,
  transportError,
} from '@freddie/freddie-host-apiproxy/api'
export { AbstractApiClient } from '@freddie/freddie-host-apiproxy/client'

/**
 * Unwrap a unary response: RpcResponse<T> -> RpcResult<T> (business code only
 * cares about the result slot).
 * @param response - the unary response.
 * @returns its result slot.
 */
export function resultOf(response) {
  return response.result
}
