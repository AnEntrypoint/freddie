export const OFFLOADED_IMAGE_TEXT
  = '[image omitted to keep the request within its image limit; older images are omitted first. If this image is still needed, read its file again when a path is available; otherwise ask the user to attach it again.]'

export function textOnlyImageText(ref) {
  const digest = String(ref.attachmentId).slice('sha256:'.length, 'sha256:'.length + 8)
  return `[image omitted because this model accepts text only; attachment sha256:${digest}]`
}

export function requestImageHandleText(version) {
  return `Image ${version.attachment.attachmentId}; request image ${version.width}x${version.height}px.`
}

export function contentHasImage(content) {
  return content.some(block => block.type === 'image'
    || (block.type === 'tool-result' && contentHasImage(block.content)))
}

function base64Length(bytes) {
  return Math.ceil(bytes / 3) * 4
}

function collectImageLengths(blocks, lengths, policy) {
  for (const block of blocks) {
    if (block.type === 'image') {
      const bytes = policy.byteLength === undefined
        ? block.attachment.bytes
        : policy.byteLength(block.attachment)
      lengths.push(policy.representation === 'base64' ? base64Length(bytes) : bytes)
    } else if (block.type === 'tool-result') {
      collectImageLengths(block.content, lengths, policy)
    }
  }
}

function replaceOldestImages(blocks, remaining) {
  let next
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'image' && remaining.count > 0) {
      remaining.count -= 1
      next ??= blocks.slice(0, index)
      next.push({ type: 'text', text: OFFLOADED_IMAGE_TEXT })
      continue
    }
    if (block.type === 'tool-result') {
      const content = replaceOldestImages(block.content, remaining)
      if (content !== block.content) {
        next ??= blocks.slice(0, index)
        next.push({ ...block, content })
        continue
      }
    }
    next?.push(block)
  }
  return next ?? blocks
}

function replaceImagesForTextModel(blocks) {
  let next
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'image') {
      next ??= blocks.slice(0, index)
      next.push({ type: 'text', text: textOnlyImageText(block.attachment) })
      continue
    }
    if (block.type === 'tool-result') {
      const content = replaceImagesForTextModel(block.content)
      if (content !== block.content) {
        next ??= blocks.slice(0, index)
        next.push({ ...block, content })
        continue
      }
    }
    next?.push(block)
  }
  return next ?? blocks
}

export function projectImagesForTextModel(messages) {
  if (!messages.some(message => contentHasImage(message.content))) return messages
  return messages.map((message) => {
    const content = replaceImagesForTextModel(message.content)
    return content === message.content ? message : { ...message, content }
  })
}

export function offloadRequestImages(messages, maxRequestImageBytes) {
  return offloadRequestImagesWithPolicy(messages, {
    representation: 'base64',
    ...maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes },
    byteQuantum: 1,
  })
}

export function offloadRequestImagesWithPolicy(messages, policy) {
  const lengths = []
  for (const message of messages) collectImageLengths(message.content, lengths, policy)
  const total = lengths.reduce((sum, bytes) => sum + bytes, 0)
  const excessCount = policy.maxImages === undefined ? 0 : Math.max(0, lengths.length - policy.maxImages)
  const excessBytes = policy.maxBytes === undefined ? 0 : Math.max(0, total - policy.maxBytes)
  if (excessCount === 0 && excessBytes === 0) return messages
  const countQuantum = policy.countQuantum ?? 1
  const byteQuantum = policy.byteQuantum ?? 1
  const removeCount = excessCount === 0 ? 0 : Math.ceil(excessCount / countQuantum) * countQuantum
  const removeBytes = excessBytes === 0 ? 0 : Math.ceil(excessBytes / byteQuantum) * byteQuantum
  let count = 0
  let removedBytes = 0
  for (const imageBytes of lengths) {
    const byteTargetMet = removeBytes === 0
      || (byteQuantum === 1 ? removedBytes >= removeBytes : removedBytes > removeBytes)
    if (count >= removeCount && byteTargetMet) break
    removedBytes += imageBytes
    count += 1
  }
  const remaining = { count }
  return messages.map((message) => {
    const content = replaceOldestImages(message.content, remaining)
    return content === message.content ? message : { ...message, content }
  })
}
