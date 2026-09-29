
import { extractMarkdownPlainText } from '@freddie/freddie-client-ui-primitives'

const PREVIEW_SOURCE_CHARACTERS = 2_048
const PREVIEW_OUTPUT_CHARACTERS = 512

export function trajectoryPreviewText(text) {
  const source = text.slice(0, PREVIEW_SOURCE_CHARACTERS)
  const compact = extractMarkdownPlainText(source).replace(/\s+/g, ' ').trim()
  const preview = compact.slice(0, PREVIEW_OUTPUT_CHARACTERS).trimEnd()
  return source.length < text.length || preview.length < compact.length
    ? `${preview}…`
    : preview
}
