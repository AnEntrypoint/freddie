/**
 * Curated editor for the direct DeepSeek adapter's advisory model catalog.
 * The settings layer replaces `models` as one array, so the parent supplies
 * the effective inherited rows until the first edit materializes a user
 * override; reset removes that override instead of copying defaults into it.
 *
 * Converted from a React hooks component to a webjsx custom element: the two
 * useState buffers (editing/expanded) become instance fields, and re-render
 * is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 */

import { applyDiff, createElement as h } from 'webjsx'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconPlusOutline16, IconTrashOutline16,
} from '@freddie/freddie-client-ui-primitives'
import styles from './ModelsSection.css.js'

/** Row index encoded in an editing-buffer key. */
function rowOf(key) {
  return Number(key.slice(0, key.indexOf(':')))
}

/** Accepted capacity spellings: a decimal count with an optional K/M suffix. */
const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i

/** Decimal suffix scales — `1M` is 1000K, matching how model capacities are quoted. */
const CAPACITY_SCALE = { k: 1_000, m: 1_000_000 }

/**
 * Read a typed capacity, so a user can write `256K` or `1M` instead of counting
 * zeroes. The stored value stays a plain token count.
 * @param text - raw field text.
 * @returns the count; `undefined` when blank (inherit), `NaN` when unreadable
 * (rejected by {@link validateDeepSeekModels} before any write).
 */
export function parseCapacity(text) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const match = CAPACITY_PATTERN.exec(trimmed)
  if (match === null) return Number.NaN
  const suffix = match[2]?.toLowerCase()
  const scale = suffix === 'k' || suffix === 'm' ? CAPACITY_SCALE[suffix] : 1
  const scaled = Number(match[1]) * scale
  // A decimal multiple is exact in intent but not in binary floating point
  // (2.3 * 1e6 lands a few ULPs high), so an integral intent snaps back.
  const rounded = Math.round(scaled)
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled
}

/**
 * Spell a stored count back in the shortest form that survives a round trip
 * through {@link parseCapacity}; a count that is not a whole number of
 * thousands stays written out.
 * @param value - stored capacity.
 * @returns the field text.
 */
export function formatCapacity(value) {
  if (!Number.isInteger(value) || value <= 0) return String(value)
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`
  return String(value)
}

/** Convert a schema-validated catalog value into records without dropping hidden fields. */
export function modelDrafts(value) {
  if (!Array.isArray(value)) return []
  return value.map(entry =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? entry
      : {})
}

/**
 * Validate adapter constraints that the serialized schema cannot express.
 * @param value - user-owned `models` value, or undefined while inherited.
 * @returns the first invalid row, or undefined when the adapter will accept it.
 */
export function validateDeepSeekModels(value) {
  if (value === undefined) return undefined
  const models = modelDrafts(value)
  const seen = new Set()
  for (const [index, model] of models.entries()) {
    // Compared trimmed: surrounding whitespace is a paste artifact the adapter
    // would never match, and an untrimmed compare lets `model ` slip past the
    // duplicate check against its own twin.
    const id = model['id']
    const trimmed = typeof id === 'string' ? id.trim() : undefined
    if (trimmed === undefined || trimmed.length === 0) return { index, key: 'modelIdRequired' }
    if (seen.has(trimmed)) return { index, key: 'modelIdDuplicate' }
    seen.add(trimmed)
    const name = model['name']
    if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
      return { index, key: 'modelNameInvalid' }
    }
    const contextWindow = model['contextWindow']
    if (contextWindow !== undefined
      && (typeof contextWindow !== 'number' || !Number.isInteger(contextWindow) || contextWindow <= 0)) {
      return { index, key: 'modelContextInvalid' }
    }
    const maxTokens = model['maxTokens']
    if (maxTokens !== undefined
      && (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens <= 0)) {
      return { index, key: 'modelMaxTokensInvalid' }
    }
  }
  return undefined
}

const DEFAULT_PROPS = {
  models: [],
  overridden: false,
  defaultContextWindow: undefined,
  defaultMaxTokens: undefined,
  t: key => key,
  disabled: false,
  onChange: () => {},
  onReset: () => {},
}

/**
 * The direct DeepSeek adapter's model catalog editor: id and display name on
 * each row, capacities behind the row's own disclosure. Custom element —
 * `editing`/`expanded` were `useState` buffers, now instance fields.
 */
export class FreddieDeepSeekModelsEditor extends HTMLElement {
  #props = DEFAULT_PROPS
  // Keys carry the row index, so the two operations that move indexes maintain
  // them: `remove` re-keys around the dropped row, and reset clears them all
  // because the rows they annotated are gone.
  #editing = new Map()
  #expanded = new Set()

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #update(index, key, value) {
    const next = this.#props.models.map((model, at) => {
      const copy = { ...model }
      if (at !== index) return copy
      if (value === undefined) Reflect.deleteProperty(copy, key)
      else copy[key] = value
      return copy
    })
    this.#props.onChange(next)
  }

  #remove(index) {
    const nextEditing = new Map()
    for (const [key, text] of this.#editing) {
      const at = rowOf(key)
      if (at === index) continue
      // Only the row number moves; the field half of the key is untouched.
      nextEditing.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, text)
    }
    this.#editing = nextEditing
    const nextExpanded = new Set()
    for (const at of this.#expanded) {
      if (at === index) continue
      nextExpanded.add(at > index ? at - 1 : at)
    }
    this.#expanded = nextExpanded
    this.#props.onChange(this.#props.models.filter((_model, at) => at !== index).map(model => ({ ...model })))
  }

  #reset() {
    this.#editing = new Map()
    this.#expanded = new Set()
    this.#props.onReset()
  }

  #toggle(index) {
    const next = new Set(this.#expanded)
    if (!next.delete(index)) next.add(index)
    this.#expanded = next
    this.#render()
  }

  /** The field's text: its live keystrokes, else the stored count spelled short. */
  #capacityText(model, index, field) {
    const typed = this.#editing.get(`${String(index)}:${field}`)
    if (typed !== undefined) return typed
    const value = model[field]
    return typeof value === 'number' ? formatCapacity(value) : ''
  }

  #settleCapacity(index, field) {
    const key = `${String(index)}:${field}`
    const typed = this.#editing.get(key)
    if (typed === undefined) return
    // Unreadable text stays on screen: the save-time rejection names a row the
    // user can still see and correct.
    const parsed = parseCapacity(typed)
    if (parsed !== undefined && Number.isNaN(parsed)) return
    const next = new Map(this.#editing)
    next.delete(key)
    this.#editing = next
  }

  /** One capacity field of one row, rendered inside the row's disclosure. */
  #capacityField(model, index, field, fallback) {
    const props = this.#props
    return h('label', { class: styles['modelField'] ?? '' },
      h('span', { class: styles['modelFieldLabel'] ?? '' }, props.t(field === 'contextWindow' ? 'contextWindow' : 'maxTokens')),
      h('input', {
        class: styles['input'] ?? '',
        type: 'text',
        inputmode: 'numeric',
        value: this.#capacityText(model, index, field),
        placeholder: fallback === undefined
          ? props.t(field === 'contextWindow' ? 'contextWindowPlaceholder' : 'maxTokensPlaceholder')
          : formatCapacity(fallback),
        'aria-label': `${props.t(field === 'contextWindow' ? 'contextWindow' : 'maxTokens')} ${String(index + 1)}`,
        disabled: props.disabled,
        onchange: (event) => {
          const text = event.target.value
          this.#editing = new Map(this.#editing).set(`${String(index)}:${field}`, text)
          this.#update(index, field, parseCapacity(text))
          this.#render()
        },
        onblur: () => { this.#settleCapacity(index, field); this.#render() },
      }),
    )
  }

  #render() {
    const props = this.#props
    const vdom = h('section', { class: styles['modelCatalog'] ?? '', 'aria-label': props.t('models') },
      h('div', { class: styles['modelListHead'] ?? '' },
        h('div', { class: styles['modelCatalogHeading'] ?? '' },
          h('span', { class: styles['modelCatalogTitle'] ?? '' }, props.t('models')),
          h('span', { class: styles['modelCatalogMeta'] ?? '' },
            props.overridden ? props.t('modelsCustomized') : props.t('modelsInherited')),
        ),
        props.overridden
          ? h('button', {
            type: 'button',
            class: styles['linkButton'] ?? '',
            disabled: props.disabled,
            onclick: () => { this.#reset(); this.#render() },
          }, props.t('resetModels'))
          : null,
      ),
      props.models.length === 0
        ? h('p', { class: styles['modelEmpty'] ?? '' }, props.t('modelsEmpty'))
        : h('div', { class: styles['modelList'] ?? '' },
          props.models.map((model, index) => (
            h('div', { class: styles['modelEntry'] ?? '', key: index },
              h('div', { class: styles['modelRow'] ?? '' },
                h('input', {
                  class: styles['input'] ?? '',
                  type: 'text',
                  value: typeof model['id'] === 'string' ? model['id'] : '',
                  placeholder: props.t('modelId'),
                  'aria-label': `${props.t('modelId')} ${String(index + 1)}`,
                  disabled: props.disabled,
                  onchange: (event) => { this.#update(index, 'id', event.target.value) },
                  onblur: (event) => {
                    // Settle a pasted id rather than trimming per keystroke,
                    // which would stop the user typing an interior space.
                    const value = event.target.value
                    const trimmed = value.trim()
                    if (trimmed !== value) this.#update(index, 'id', trimmed)
                  },
                }),
                h('input', {
                  class: styles['input'] ?? '',
                  type: 'text',
                  value: typeof model['name'] === 'string' ? model['name'] : '',
                  placeholder: props.t('modelName'),
                  'aria-label': `${props.t('modelName')} ${String(index + 1)}`,
                  disabled: props.disabled,
                  onchange: (event) => {
                    const value = event.target.value
                    this.#update(index, 'name', value === '' ? undefined : value)
                  },
                }),
                h('button', {
                  type: 'button',
                  class: styles['iconButton'] ?? '',
                  'aria-label': `${props.t('modelAdvanced')} ${String(index + 1)}`,
                  'aria-expanded': this.#expanded.has(index),
                  title: props.t('modelAdvanced'),
                  onclick: () => { this.#toggle(index) },
                }, this.#expanded.has(index) ? h(IconChevronDownOutline14, null) : h(IconChevronRightOutline14, null)),
                h('button', {
                  type: 'button',
                  class: `${styles['iconButton'] ?? ''} ${styles['iconButtonDanger'] ?? ''}`,
                  'aria-label': `${props.t('removeModel')} ${String(index + 1)}`,
                  title: props.t('removeModel'),
                  disabled: props.disabled,
                  onclick: () => { this.#remove(index); this.#render() },
                }, h(IconTrashOutline16, { size: 14 })),
              ),
              this.#expanded.has(index)
                ? h('div', { class: styles['modelAdvanced'] ?? '' },
                  this.#capacityField(model, index, 'contextWindow', props.defaultContextWindow),
                  this.#capacityField(model, index, 'maxTokens', props.defaultMaxTokens),
                )
                : null,
            )
          )),
        ),
      h('button', {
        type: 'button',
        class: styles['addModelButton'] ?? '',
        disabled: props.disabled,
        onclick: () => { props.onChange([...props.models.map(model => ({ ...model })), { id: '' }]) },
      }, h(IconPlusOutline16, { size: 14 }), props.t('addModel')),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-deepseek-models-editor') === undefined) {
  customElements.define('freddie-deepseek-models-editor', FreddieDeepSeekModelsEditor)
}

/**
 * Create (if needed) or update a DeepSeekModelsEditor element in place.
 * @param el - an existing element to update, or null to create one.
 * @param props - see {@link DeepSeekModelsEditorProps}.
 * @returns the element; keep it and pass it back in to update.
 */
export function renderDeepSeekModelsEditor(el, props) {
  const target = el ?? document.createElement('freddie-deepseek-models-editor')
  target.setProps(props)
  return target
}

/**
 * Render the direct DeepSeek adapter's model catalog.
 * @param props - effective rows plus the array-level override actions.
 * @returns the catalog editor, cast for JSX use (Modal.tsx's pattern).
 */
export function DeepSeekModelsEditor(props) {
  return renderDeepSeekModelsEditor(null, props)
}
