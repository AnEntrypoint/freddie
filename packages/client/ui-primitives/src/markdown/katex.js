
import { createElement as h } from '@freddie/webjsx'
import katex from 'katex'

function styleValue(css) {
  return css
}

function domToVNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node
  const props = { key }
  for (const attribute of element.attributes) {
    if (attribute.name === 'class') props['class'] = attribute.value
    else if (attribute.name === 'style') props['style'] = styleValue(attribute.value)
    else props[attribute.name] = attribute.value
  }
  const children = [...element.childNodes].map((child, index) => domToVNode(child, index))
  const result = children.length === 0
    ? h(element.localName, props)
    : h(element.localName, props, ...children)
  return result
}

export function renderTexToVNodes(value, displayMode) {
  let html
  try {
    html = katex.renderToString(value, { displayMode, throwOnError: true })
  } catch (error) {
    try {
      html = katex.renderToString(value, { displayMode, strict: 'ignore', throwOnError: false })
    } catch {
      return [
        h(
          'span',
          { class: 'katex-error', style: 'color: #cc0000', title: String(error) },
          value,
        ),
      ]
    }
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return [...parsed.body.childNodes].map((node, index) => domToVNode(node, index))
}
