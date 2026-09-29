import { valueMap } from '@freddie/cosmokit'

// eslint-disable-next-line no-new-func
export const evaluate = new Function('ctx', 'expr', `
  with (ctx) {
    return eval(expr)
  }
`)

export function interpolate(ctx, value) {
  if (isJsExpr(value)) {
    return evaluate(ctx, value.__jsExpr)
  } else if (!value || typeof value !== 'object') {
    return value
  } else if (Array.isArray(value)) {
    return value.map(item => interpolate(ctx, item))
  } else {
    return valueMap(value, item => interpolate(ctx, item))
  }
}

export function isJsExpr(value) {
  return value instanceof Object && '__jsExpr' in value
}
