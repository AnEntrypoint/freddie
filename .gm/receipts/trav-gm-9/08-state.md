# 08-STATE: trav-gm-9

- owned state: none. `computeContentParts` is a pure function of `content`; its WeakMap cache lives in `contentParts` and is unchanged.
- replay: the edit is idempotent. The anchor `const b = block` is absent after the change, so re-applying the edit finds nothing to replace.
