# @freddie/freddie-dream-rsi

Bundle for `@freddie/freddie-dream-rsi-context`, listed after the app bundle in every shipped profile template. It appends grounded Dream-RSI directives after successful `gm_dream_replay` results and after automatic strategy records from gm's instruction response.

```yaml
bundles:
  - '@freddie/freddie-base'
  - '@freddie/freddie-dream-rsi'
```

The bundle mounts the context plugin with `enabled: true` and `maxObservedNodes: 16`. It does not mount the plugin's `./invariant` companion, because no shipped composition provides the `invariants` service and the row would never activate. GM's internal evaluator derives target, score, and cost from completed dispatch evidence before a replay result can reach the context plugin.

## Model Experience

The bundle adds no prompt text directly. Its context plugin appends one evidence-bound directive only after a validated replay receipt or a matching `gm/progress` and `gm/dream-rsi` record pair is present in the session log; a session without either adds nothing.

## Known Limitations and Deferred Work

- The bundle does not enable GM, create discovery worlds, or grant any mutation authority.
- Replay evidence covers only the recorded worlds passed to GM.
- The plugin scans the session's events on every step while mounted.
