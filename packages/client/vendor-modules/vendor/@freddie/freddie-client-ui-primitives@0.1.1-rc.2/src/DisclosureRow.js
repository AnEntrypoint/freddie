import { createElement as h } from 'webjsx'
import clsx from 'clsx'
import { IconChevronDownOutline14 } from './icons/index.js'
import css from './DisclosureRow.css.js'

/**
 * Render one disclosure header and its controlled expanded content.
 * @param props - Visual content, controlled state, and interaction policy.
 * @returns the disclosure row.
 */
export function DisclosureRow({
  icon,
  title,
  open,
  expandable,
  onToggle,
  expandOnRowClick = false,
  previewChevron = expandable,
  keepContentWhenOpen = false,
  collapsedContent,
  children,
  className,
  rowClassName,
  leadingClassName,
  chevronClassName,
  titleClassName,
}) {
  const rowExpands = expandable && expandOnRowClick
  const toggleFromLeading = (event) => {
    event.stopPropagation()
    onToggle()
  }
  const toggleFromKeyboard = (event) => {
    if (!rowExpands || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onToggle()
  }
  const collapsedLeading = previewChevron
    ? [
      h('span', { class: css.iconIdle ?? '' }, icon),
      h(IconChevronDownOutline14, { className: clsx(chevronClassName, css.chevronHover) }),
    ]
    : icon
  const leading = open
    ? h(IconChevronDownOutline14, { className: chevronClassName })
    : collapsedLeading

  return h(
    'div',
    { class: clsx(css.root, className), 'data-open': open || undefined },
    h(
      'div',
      {
        class: clsx(css.row, rowClassName),
        'data-disclosure-row': '',
        'data-expandable': rowExpands || undefined,
        role: rowExpands ? 'button' : null,
        tabindex: rowExpands ? 0 : undefined,
        'aria-expanded': rowExpands ? open : undefined,
        onclick: rowExpands ? onToggle : null,
        onkeydown: rowExpands ? toggleFromKeyboard : null,
      },
      expandable && !rowExpands ? (
        h(
          'button',
          {
            type: 'button',
            class: clsx(css.leading, leadingClassName),
            'aria-expanded': open,
            onclick: toggleFromLeading,
          },
          leading,
        )
      ) : (
        h('span', { class: clsx(css.leading, leadingClassName) }, leading)
      ),
      h('span', { class: clsx(css.title, titleClassName) }, title),
      (keepContentWhenOpen || !open) && collapsedContent,
    ),
    open && children,
  )
}
