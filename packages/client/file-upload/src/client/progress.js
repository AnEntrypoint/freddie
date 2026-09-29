/**
 * Consumed-byte progress for one stream body.
 *
 * The tap sits on the page (or in whatever host runs this module) rather than
 * inside the Worker, so there is exactly one counting implementation shared by
 * every carrier — the page-owned one included — and it is exercisable outside
 * a browser. `pull` is driven by the consumer, so a reported `loaded` is
 * bytes the transport has actually taken, not bytes queued ahead of it.
 * @module @freddie/freddie-client-file-upload/progress
 */

/**
 * Wrap one byte stream so every chunk handed downstream is counted.
 * @param source - the caller's one-shot byte stream; reading it locks the object.
 * @param onProgress - observer receiving monotone `{ loaded }` counts.
 * @returns a new stream carrying the same bytes, reporting as it goes.
 */
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
