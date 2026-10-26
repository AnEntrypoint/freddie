# trav-gm-50 — 02 unknowns

session: orch-fin-1792994560-7712-15
recorded with mutable-add (dispatches 1792995627348, 1792995627811, 1792995628341)

- trav-gm-50-U1: At HEAD, does a disconnect while the clipboard write is still pending let createCopyFeedback arm a reset timer after stop() that is never cancelled (reset render after disconnect)?
- trav-gm-50-U2: At HEAD, does a settled copy followed by disconnect fire any reset render after disconnect (row witness_plan path)?
- trav-gm-50-U3: Does the gpu-free Node instrument observe the copy reset cycle (control arm, no disconnect), so a zero count elsewhere is meaningful?

Open at the end of this stage: U1, U2, U3. ELIMINATE runs them live next.
