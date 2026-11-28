import { valueMap } from '@freddie/cosmokit'
import { process } from '@freddie/freddie-runtime/process'

const run = new Function('ctx', 'expr', 'process', `
  with (ctx) {
    return eval(expr)
  }
`)

export const evaluate = (ctx, expr) => run(ctx, expr, process)

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
