export function fileUploadWorker(
  scope = self,
  createXhr = () => new XMLHttpRequest(),
  doFetch = (input, init) => fetch(input, init),
) {
  scope.onmessage = (event) => {
    const request = event.data
    if (request.body instanceof Blob) {
      const xhr = createXhr()
      xhr.open('POST', request.url)
      xhr.withCredentials = true
      for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value)
      xhr.upload.onprogress = (progress) => {
        scope.postMessage({
          kind: 'progress',
          loaded: progress.loaded,
          ...(progress.lengthComputable ? { total: progress.total } : {}),
        })
      }
      xhr.onload = () => {
        scope.postMessage({ kind: 'complete', status: xhr.status, body: xhr.responseText })
      }
      xhr.onerror = () => {
        scope.postMessage({ kind: 'error', message: 'background upload transport failed' })
      }
      xhr.send(request.body)
      return
    }
    if (!(request.body instanceof ReadableStream)) {
      scope.postMessage({ kind: 'error', message: 'background upload worker received an invalid body' })
      return
    }
    void (async () => {
      const response = await doFetch(request.url, {
        method: 'POST',
        headers: request.headers,
        credentials: 'include',
        body: request.body,
        duplex: 'half',
      })
      scope.postMessage({
        kind: 'complete',
        status: response.status,
        body: await response.text(),
      })
    })().catch((error) => {
      scope.postMessage({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }
}
