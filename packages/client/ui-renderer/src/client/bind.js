export function bindSnapshotSelector(w) {
  return function useSelector(sel, _eq) {
    return sel(w.getSnapshot())
  }
}
