// Browser stand-in for node:module. createRequire is unreachable in the
// configured loader path (the browser boot never takes that branch) and
// fails loud if that assumption changes.
export const createRequire = () => {
  throw new Error('node:module is not available in the browser')
}
