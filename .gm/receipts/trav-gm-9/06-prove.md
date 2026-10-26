# 06-PROVE: trav-gm-9

- precondition: `MessageItem.js:43` read `const b = block` before the edit (orient, u5 remote read).
- invariant: `computeContentParts` returns `{ text, images, rest }` identical to the pre-change output on the same content. Witnessed by C3 (`/tmp/gm-trav-9/baseline.json`, equal: true).
- postcondition: no `const b = block`, no `b.type|text|attachment` in the file (C1, C2 = 0 matches). The alias's uses now read `block` (positive control: 6 occurrences).
- leader hypothesis (SPECIFY/ORIENT): the alias is a pure reference; removing it leaves output unchanged. The probe separates it from the rejected hypothesis (a changed image branch): mutant `images: [{}]` differs (C4).
- result: pass.
