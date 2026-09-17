# @freddie/freddie-dream-rsi

Opt-in bundle for `@freddie/freddie-dream-rsi-context`. Add this bundle after `@freddie/freddie-base` in a profile to append grounded Dream-RSI directives after successful `gm_dream_replay` results.

```yaml
bundles:
  - '@freddie/freddie-base'
  - '@freddie/freddie-dream-rsi'
```

The bundle mounts the context plugin and its invariant with `enabled: true` and `maxObservedNodes: 16`. GM's internal evaluator derives target, score, and cost from completed dispatch evidence before a replay result can reach the context plugin.

## Model Experience

The bundle adds no prompt text directly. Its context plugin appends one evidence-bound directive only after a validated replay receipt is present in the session log.

## Known Limitations and Deferred Work

- The bundle does not enable GM, create discovery worlds, or grant any mutation authority.
- Replay evidence covers only the recorded worlds passed to GM.
