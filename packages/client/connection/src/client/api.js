export {
  RpcId,
  SESSION_SEARCH_RESULT_LIMIT,
  transportError,
} from '@freddie/freddie-host-apiproxy/api'
export { AbstractApiClient } from '@freddie/freddie-host-apiproxy/client'

export function resultOf(response) {
  return response.result
}
