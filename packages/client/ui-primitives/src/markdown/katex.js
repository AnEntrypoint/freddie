/**
 * TeX-to-webjsx via KaTeX, replicating the rehype-katex pipeline this renderer
 * replaced: the same three-arm error chain (strict render, `strict: 'ignore'`
 * retry, error span) and a DOM-identical element tree, so settled math keeps
 * its exact markup. KaTeX emits an HTML string; the browser's own HTML parser
 * (`DOMParser`, applying the spec's SVG/MathML foreign-content attribute
 * adjustments KaTeX output relies on) turns it into a tree this module maps
 * onto webjsx VNodes — KaTeX output is a static span/MathML/SVG vocabulary
 * with no raw user HTML, the same trust shiki's tree gets in CodeBlock.
 *
 * webjsx has no MathML-aware renderer beyond plain DOM creation, so the
 * `.katex-mathml` subtree's elements land the same way they did under the
 * replaced hast-util-to-jsx-runtime pipeline: tag names only, no namespace
 * distinction at this layer. The visual arm is the `.katex-html` span tree;
 * the MathML arm serves assistive technology, which reads it by tag name
 * regardless of namespace.
 */

import { createElement as h } from 'webjsx'
import katex from 'katex'

/**
 * Convert one inline `style` attribute string into a CSS string webjsx's
 * `style` prop accepts directly (webjsx has no style-object prop; the
 * original attribute text is already valid CSS since KaTeX emits only plain
 * kebab-case declarations with no custom properties).
 */
function styleValue(css) {
  return css
}

/** Map one parsed DOM node onto a webjsx VNode (text nodes pass through). */
function domToVNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  /* v8 ignore next 2 -- KaTeX output holds only elements and text; other
     node kinds cannot appear in its serialized vocabulary. */
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

/**
 * Render TeX source to webjsx VNodes through KaTeX.
 * @param value - The TeX source (math node value; fenced `math` blocks append
 * their trailing newline to match the replaced pipeline's text extraction).
 * @param displayMode - Display (block) versus inline rendering.
 * @returns KaTeX's element tree, or the error span when the source does not
 * parse (colored with KaTeX's stock `errorColor`, matching rehype-katex).
 */
export function renderTexToVNodes(value, displayMode) {
  let html
  try {
    html = katex.renderToString(value, { displayMode, throwOnError: true })
  } catch (error) {
    try {
      html = katex.renderToString(value, { displayMode, strict: 'ignore', throwOnError: false })
    } catch {
      // KaTeX renders ParseErrors itself under throwOnError: false; only its
      // internal errors reach here, so mirror rehype-katex's manual span.
      /* v8 ignore next 8 */
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
