export function progressStream(source, onProgress) {
  const reader = source.getReader()
  let loaded = 0
  return new ReadableStream({
    async pull(controller) {
      const item = await reader.read()
      if (item.done) {
        controller.close()
        return
      }
      if (!(item.value instanceof Uint8Array)) {
        controller.error(new TypeError('file upload stream produced a non-Uint8Array chunk'))
        return
      }
      loaded += item.value.byteLength
      onProgress({ loaded })
      controller.enqueue(item.value)
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}
