import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconPlusOutline16, IconTrashOutline16,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import styles from './ModelsSection.css.js'

function rowOf(key) {
  return Number(key.slice(0, key.indexOf(':')))
}

const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i

const CAPACITY_SCALE = { k: 1_000, m: 1_000_000 }

export function parseCapacity(text) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const match = CAPACITY_PATTERN.exec(trimmed)
  if (match === null) return Number.NaN
  const suffix = match[2]?.toLowerCase()
  const scale = suffix === 'k' || suffix === 'm' ? CAPACITY_SCALE[suffix] : 1
  const scaled = Number(match[1]) * scale
  const rounded = Math.round(scaled)
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled
}

export function formatCapacity(value) {
  if (!Number.isInteger(value) || value <= 0) return String(value)
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`
  return String(value)
}

export function modelDrafts(value) {
  if (!Array.isArray(value)) return []
  return value.map(entry =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? entry
      : {})
}

export function validateDeepSeekModels(value) {
  if (value === undefined) return undefined
  const models = modelDrafts(value)
  const seen = new Set()
  for (const [index, model] of models.entries()) {
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

export class FreddieDeepSeekModelsEditor extends HTMLElement {
  #props = DEFAULT_PROPS
  #editing = new Map()
  #expanded = new Set()

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
    const parsed = parseCapacity(typed)
    if (parsed !== undefined && Number.isNaN(parsed)) return
    const next = new Map(this.#editing)
    next.delete(key)
    this.#editing = next
  }

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

defineElement('freddie-deepseek-models-editor', FreddieDeepSeekModelsEditor)

export function renderDeepSeekModelsEditor(el, props) {
  const target = el ?? document.createElement('freddie-deepseek-models-editor')
  target.setProps(props)
  return target
}

export function DeepSeekModelsEditor(props) {
  return renderDeepSeekModelsEditor(null, props)
}
