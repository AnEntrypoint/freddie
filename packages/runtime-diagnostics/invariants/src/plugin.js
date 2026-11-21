export const invariantPlugin = (packageName, name, inject = ['invariants']) => ({
  name,
  inject,
  apply: (ctx) => Promise.resolve(ctx.invariants.register(packageName, () => {})),
})
