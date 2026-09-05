// Converted from a React hooks component to a webjsx custom element. State
// that was useState/useRef becomes instance fields; explicit applyDiff(this,
// vdom) replaces implicit re-render on setState.

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import {
  Button, IconCheckOutline14, IconChevronDownOutline14, IconChevronLeftOutline14,
  IconChevronRightOutline14, IconChevronUpOutline14, IconCloseOutline16,
  IconEditOutline16, renderMarkdownText,
} from '@freddie/freddie-client-ui-primitives'
import { PendingQuestion, planReviewOf } from './contract/slots.js'
import { FreddiePlanReviewPanel } from './PlanReviewPanel.js'
import css from './QuestionComposer.css.js'

/**
 * Split the conventional recommendation suffix without changing the answer value.
 * @param label - Original option label returned if selected.
 * @returns Display label plus recommendation state.
 */
export function parseRecommendedLabel(label) {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}

/** Return whether a text-field key event belongs to an active IME composition. */
function isComposing(event) {
  // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
  // oxlint-disable-next-line typescript/no-deprecated
  return event.isComposing || event.keyCode === 229
}

/**
 * Auto-growing free-text answer: a textarea, so a long answer soft-wraps and
 * Shift+Enter breaks a line, over a hidden mirror that owns the height.
 *
 * The mirror renders the draft plus a trailing newline in normal flow and so
 * sizes the grid row (counting rows by '\n' cannot see soft wraps); the
 * textarea shares that one cell and stretches to it, and `rows={1}` keeps the
 * control's own intrinsic height out of the row sizing so the mirror alone
 * decides. Past the mirror's cap the textarea scrolls itself — it is the only
 * scrollport in the stack, there being no second glyph layer to keep aligned.
 * Mirror and textarea MUST share font, line-height, padding and wrapping rules
 * or the two heights diverge.
 *
 * @param props - field shape, draft text, and the field's event handlers.
 * @returns The mirrored auto-growing field.
 */
function AnswerField(props) {
  return (
    h('div', {class: clsx(css.field, props.variant === 'inline' ? css.customInline : css.customBlock)},
      h('div', {'aria-hidden': '', class: css.fieldMirror ?? ''}, `${props.value}\n`),
      h('textarea', {
        autoFocus: props.autoFocus,
        class: css.fieldInput ?? '',
        value: props.value,
        disabled: props.disabled,
        rows: 1,
        placeholder: props.placeholder,
        onfocus: props.onFocus ?? null,
        oninput: props.onChange,
        onkeydown: props.onKeyDown,
      }),
    )
  )
}

/**
 * Composer takeover boundary; the carrier key keys local drafts, so a
 * same-request replay (same key, new carrier object) preserves them.
 *
 * One takeover, two shapes: a request that declares a presentation intent this
 * package renders takes that shape (a plan review is one decision over one
 * plan, not a question set), and every other request takes the generic flow.
 * The routing lives here, at the one entry that owns the composer seat, so
 * neither shape can claim a request the other is already rendering.
 *
 * Converted to a webjsx custom element: the domain-face mint (previously
 * useMemo) rides the carrier's stable identity via a cached field, and the
 * routing decision re-renders the child custom element (either the generic
 * question flow or the plan-review panel) via setProps.
 */
export class FreddieQuestionComposer extends HTMLElement {
  #props = null
  #question = null
  #carrier = null

  setProps(props) {
    this.#props = props
    if (this.#carrier !== props.matched) {
      this.#carrier = props.matched
      this.#question = new PendingQuestion(props.matched)
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    const question = this.#question
    if (props === null || question === null) return
    const review = planReviewOf(question.questions)
    // The two shapes are custom elements this package itself registers, not
    // ordinary intrinsic HTML tags — created directly rather than through JSX
    // (webjsx's IntrinsicElements table covers built-in DOM tags only) and
    // reused across re-renders so setProps drives their own applyDiff.
    if (review === undefined) {
      let el = this.#childHost
      if (!(el instanceof FreddieQuestionFlow)) {
        el = document.createElement('freddie-question-flow')
        this.#childHost = el
        this.replaceChildren(el)
      }
      el.setProps({ pending: question, t: props.t })
    } else {
      let el = this.#childHost
      if (!(el instanceof FreddiePlanReviewPanel)) {
        el = document.createElement('freddie-plan-review-panel')
        this.#childHost = el
        this.replaceChildren(el)
      }
      el.setProps({ pending: question, review, t: props.t })
    }
  }

  #childHost = null
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-question-composer') === undefined) {
  customElements.define('freddie-question-composer', FreddieQuestionComposer)
}

/**
 * The generic question flow custom element: pager, numbered options, skip and
 * custom-answer affordances over a request's whole question batch. Converted
 * from a React hooks component — every useState becomes an instance field,
 * useRef(Set) becomes a plain instance field, and re-render is explicit.
 */
export class FreddieQuestionFlow extends HTMLElement {
  #props = null
  #index = 0
  #drafts = []
  #busy = null
  #error = null
  #minimized = false
  #focusedQuestions = new Set()
  #detailEls = new Map()

  setProps(props) {
    const pendingChanged = this.#props === null || this.#props.pending !== props.pending
    this.#props = props
    if (pendingChanged) {
      this.#index = 0
      this.#drafts = props.pending.questions.map(() => ({ selected: [], custom: '', skipped: false }))
      this.#busy = null
      this.#error = null
      this.#minimized = false
      this.#focusedQuestions = new Set()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #cancelFlow(pending) {
    this.#busy = 'cancel'
    this.#error = null
    this.#render()
    void pending.cancel().catch((cause) => {
      this.#busy = null
      this.#error = { text: cause instanceof Error ? cause.message : String(cause) }
      this.#render()
    })
  }

  #updateDraft(update) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    this.#drafts = this.#drafts.map((item, itemIndex) => itemIndex === this.#index ? update(item) : item)
    this.#error = null
  }

  #choose(label, question, questionsLength) {
    this.#updateDraft((current) => {
      if (question.multiSelect === true) {
        const selected = current.selected.includes(label)
          ? current.selected.filter(item => item !== label)
          : [...current.selected, label]
        return { ...current, selected, skipped: false }
      }
      return { selected: [label], custom: '', skipped: false }
    })
    if (question.multiSelect !== true && this.#index < questionsLength - 1) {
      this.#index += 1
    }
    this.#render()
  }

  // WAI-ARIA radio/checkbox group pattern: ArrowUp/ArrowDown/ArrowLeft/
  // ArrowRight move focus among the group's options (wrapping at the ends).
  // For a single-select group (role="radio") the native convention also
  // moves selection with focus -- but #choose's own auto-advance-to-next-
  // question behavior on selection must NOT fire here, since arrow keys are
  // navigating within one question's options, not answering and moving on;
  // this sets the draft directly rather than reusing #choose.
  #onOptionKeyDown(event, question) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp'
      && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const group = event.currentTarget.closest('[role="radiogroup"], [role="group"]')
    if (group === null) return
    const items = [...group.querySelectorAll('[role="radio"], [role="checkbox"]')]
      .filter(item => !item.disabled)
    if (items.length === 0) return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const current = items.indexOf(event.currentTarget)
    const next = current === -1
      ? (delta > 0 ? 0 : items.length - 1)
      : (current + delta + items.length) % items.length
    items[next].focus()
    if (question.multiSelect !== true) {
      const label = items[next].getAttribute('data-option-label')
      this.#updateDraft(draft => ({ selected: label === null ? draft.selected : [label], custom: '', skipped: false }))
      this.#render()
    }
  }

  #answered(item) {
    return item.selected.length > 0 || item.custom.trim() !== ''
  }

  #completed(item) {
    return this.#answered(item) || item.skipped
  }

  #submitDrafts(values) {
    const props = this.#props
    if (props === null) return
    const questions = props.pending.questions
    const missing = values.findIndex(item => !this.#completed(item))
    if (missing >= 0) {
      this.#index = missing
      this.#error = { key: 'error.incomplete' }
      this.#render()
      return
    }
    const answer = {
      answers: questions.map((item, itemIndex) => {
        const value = values[itemIndex]
        if (value.skipped) return { id: item.id, selected: [] }
        const custom = value.custom.trim()
        return {
          id: item.id,
          selected: custom === '' || item.multiSelect === true ? value.selected : [],
          ...(custom === '' ? {} : { custom }),
        }
      }),
    }
    this.#busy = 'answer'
    this.#error = null
    this.#render()
    void props.pending.answer(answer).catch((cause) => {
      this.#busy = null
      this.#error = { text: cause instanceof Error ? cause.message : String(cause) }
      this.#render()
    })
  }

  #continueFlow() {
    const props = this.#props
    if (props === null) return
    const questions = props.pending.questions
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const draft = this.#drafts[this.#index]
    if (!this.#answered(draft)) {
      this.#error = { key: 'error.unanswered' }
      this.#render()
      return
    }
    if (this.#index < questions.length - 1) {
      this.#index += 1
      this.#error = null
      this.#render()
      return
    }
    this.#submitDrafts(this.#drafts)
  }

  #skipQuestion() {
    const props = this.#props
    if (props === null) return
    const questions = props.pending.questions
    const nextDrafts = this.#drafts.map((item, itemIndex) => itemIndex === this.#index
      ? { selected: [], custom: '', skipped: true }
      : item)
    this.#drafts = nextDrafts
    this.#error = null
    if (this.#index < questions.length - 1) {
      this.#index += 1
      this.#render()
      return
    }
    this.#submitDrafts(nextDrafts)
  }

  // MarkdownText's own one-shot factory recreates its freddie-markdown-text
  // element (dropping its settled-render memoization) on every call; this
  // flow re-renders on every option toggle/draft edit for the current
  // question. Keyed by question index within this flow.
  #renderDetail(index, text) {
    const el = renderMarkdownText(this.#detailEls.get(index) ?? null, { text })
    this.#detailEls.set(index, el)
    return el
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { pending, t } = props
    const questions = pending.questions
    const index = this.#index
    const drafts = this.#drafts
    const busy = this.#busy
    const error = this.#error
    const minimized = this.#minimized
    // index stays in bounds (every index write clamps) and drafts mirrors questions 1:1.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const question = questions[index]
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const draft = drafts[index]
    const hasOptions = (question.options?.length ?? 0) > 0

    const draftCustom = (event) => {
      const value = (event.target).value
      this.#updateDraft(current => ({
        ...current,
        selected: question.multiSelect === true ? current.selected : [],
        custom: value,
        skipped: false,
      }))
      this.#render()
    }

    const continueFromCustom = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || isComposing(event)) return
      event.preventDefault()
      this.#continueFlow()
    }

    const optionButtons = (question.options ?? []).map((option, optionIndex) => {
      const selected = draft.selected.includes(option.label)
      const display = parseRecommendedLabel(option.label)
      return (
        h('button',
          {
            type: 'button', key: `${option.label}-${String(optionIndex)}`,
            class: clsx(css.option, selected && question.multiSelect !== true && css.optionSelected),
            role: question.multiSelect === true ? 'checkbox' : 'radio',
            'aria-checked': String(selected),
            'aria-label': display.label,
            'data-option-label': option.label,
            disabled: busy !== null,
            onclick: () => { this.#choose(option.label, question, questions.length) },
            onkeydown: (event) => {
              if (event.key === 'Enter') {
                if (!drafts.every(item => this.#completed(item))) return
                event.preventDefault()
                this.#submitDrafts(drafts)
                return
              }
              this.#onOptionKeyDown(event, question)
            },
          },
          question.multiSelect === true
            ? h('span', {class: clsx(css.checkbox, selected && css.checkboxChecked), 'aria-hidden': 'true'},
                selected && h(IconCheckOutline14, {size: 12}),
              )
            : h('span', {class: css.number ?? ''}, optionIndex + 1),
          h('span', {class: css.optionCopy ?? ''},
            h('span', {class: css.optionLine ?? ''},
              h('span', {class: css.optionLabel ?? ''}, display.label),
              display.recommended && h('span', {class: css.badge ?? ''}, t('option.recommended')),
              option.description !== undefined && h('span', {class: css.description ?? ''}, option.description),
            ),
          ),
        )
      )
    })

    const vdom = (
      h('div', {class: css.frame ?? '', 'data-question-key': pending.key},
        h('section',
          {
            class: clsx(css.card, minimized && css.cardMinimized),
            'aria-labelledby': `question-${pending.key}-${String(index)}`,
          },
          h('header', {class: css.header ?? ''},
            h('div', {class: css.headingBlock ?? ''},
              question.header !== undefined && h('div', {class: css.eyebrow ?? ''}, question.header),
              h('h2', {class: css.title ?? '', id: `question-${pending.key}-${String(index)}`},
                question.question,
              ),
            ),
            h('div', {class: css.headerActions ?? ''},
              h('button',
                {
                  type: 'button', class: css.iconButton ?? '',
                  'aria-label': t(minimized ? 'nav.maximize' : 'nav.minimize'),
                  title: t(minimized ? 'nav.maximize' : 'nav.minimize'),
                  'aria-expanded': String(!minimized),
                  disabled: busy !== null,
                  onclick: () => { this.#minimized = !this.#minimized; this.#render() },
                },
                minimized ? h(IconChevronUpOutline14, null) : h(IconChevronDownOutline14, null),
              ),
              h('button',
                {
                  type: 'button', class: css.iconButton ?? '', 'aria-label': t('nav.cancel'),
                  title: t('nav.cancel'),
                  disabled: busy !== null, onclick: () => { this.#cancelFlow(pending) },
                },
                h(IconCloseOutline16, null),
              ),
            ),
          ),

          !minimized && [
            h('div', {class: css.body ?? '', 'data-question-scroll': ''},
              question.detail !== undefined && h('div', {class: css.detail ?? ''}, this.#renderDetail(index, question.detail)),
              h('div', {class: css.options ?? '', role: question.multiSelect === true ? 'group' : 'radiogroup'},
                optionButtons,

                hasOptions
                  ? h('div', {class: clsx(css.customRow, draft.custom !== '' && css.customRowActive)},
                      question.multiSelect === true
                        ? h('span',
                            {
                              class: clsx(css.checkbox, draft.custom !== '' && css.checkboxChecked),
                              'aria-hidden': 'true',
                            },
                            draft.custom !== '' && h(IconCheckOutline14, {size: 12}),
                          )
                        : h('span', {class: css.number ?? '', 'aria-hidden': 'true'},
                            h(IconEditOutline16, {size: 12}),
                          ),
                      h(AnswerField, {
                        variant: 'inline',
                        value: draft.custom,
                        disabled: busy !== null,
                        placeholder: t('custom.placeholder'),
                        onChange: draftCustom,
                        onKeyDown: continueFromCustom,
                      }),
                    )
                  : h(AnswerField, {
                      autoFocus: !this.#focusedQuestions.has(index),
                      variant: 'block',
                      value: draft.custom,
                      disabled: busy !== null,
                      placeholder: t('custom.placeholder'),
                      onFocus: () => { this.#focusedQuestions.add(index) },
                      onChange: draftCustom,
                      onKeyDown: continueFromCustom,
                    }),
              ),
            ),

            h('footer', {class: css.footer ?? ''},
              h('div', {class: css.pager ?? ''},
                h('button',
                  {
                    type: 'button', class: css.iconButton ?? '', 'aria-label': t('nav.prev'),
                    disabled: index === 0 || busy !== null,
                    onclick: () => { this.#index -= 1; this.#error = null; this.#render() },
                  },
                  h(IconChevronLeftOutline14, null),
                ),
                h('span', {class: css.progress ?? ''}, index + 1, ' / ', questions.length),
                h('button',
                  {
                    type: 'button', class: css.iconButton ?? '', 'aria-label': t('nav.next'),
                    disabled: index === questions.length - 1 || busy !== null,
                    onclick: () => { this.#index += 1; this.#error = null; this.#render() },
                  },
                  h(IconChevronRightOutline14, null),
                ),
              ),
              h('div', {class: css.feedback ?? '', role: 'status'},
                error === null ? null : 'key' in error ? t(error.key) : error.text,
              ),
              h('div', {class: css.footerActions ?? ''},
                h(Button, {variant: 'outline', disabled: busy !== null, onclick: () => { this.#skipQuestion() }},
                  t('action.skip'),
                ),
                h(Button,
                  {
                    variant: 'primary',
                    disabled: busy !== null || !this.#answered(draft), onclick: () => { this.#continueFlow() },
                  },
                  busy === 'answer'
                    ? t('submitting')
                    : index === questions.length - 1 ? t('submit') : t('action.next'),
                ),
              ),
            ),
          ],
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-question-flow') === undefined) {
  customElements.define('freddie-question-flow', FreddieQuestionFlow)
}
