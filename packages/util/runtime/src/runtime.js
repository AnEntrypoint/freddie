let installed = null

export function installRuntime(runtime) {
  if (installed !== null) throw new Error('@freddie/freddie-runtime: a runtime is already installed')
  installed = runtime
}

export function activeRuntime() {
  if (installed === null) throw new Error('@freddie/freddie-runtime: no runtime installed; import @freddie/freddie-runtime/install-fx before any module that uses the runtime')
  return installed
}
