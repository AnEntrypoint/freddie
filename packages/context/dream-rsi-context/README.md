# @freddie/freddie-dream-rsi-context

Opt-in context for a grounded [Dream-RSI](https://www.dream-rsi.com/) replay selection. It adds a replay directive only after the same Session records a successful `gm_dream_replay` tool result whose candidate ranking includes the deployed baseline and whose selected score is not lower than that baseline.

## Config

```yaml
- id: dream-rsi-context
  name: '@freddie/freddie-dream-rsi-context'
  config:
    maxObservedNodes: 16
```

`maxObservedNodes` is a positive integer limiting node identifiers rendered in each directive. The package is intentionally absent from base composition; add it through an explicit profile or bundle overlay.

## Grounding boundary

The plugin reuses the durable `tool/call` to `tool/result` relation to identify `gm_dream_replay`, parses the result, and validates the selected and baseline rankings before it injects context. It does not read `.gm` files, invoke `ctx.gm`, execute a candidate policy, or treat an unobserved branch as replayed. Invalid, failed, or incomplete results add nothing.

## Model Experience

### Grounded exploration directive

#### What the model sees

An admitted request gets one sourced user message naming the selected and baseline policies and scores, a bounded list of observed replay nodes, and the restriction that only recorded evidence supports the directive.

#### Token effect

One directive is retained for every eligible request after a valid replay result until compaction shadows it. `maxObservedNodes` bounds the variable node-list contribution.

#### KV Cache effect

Each directive appends after the reusable request prefix. A different replay result changes the suffix supplied to later requests.

## Known Limitations and Deferred Work

- Replay coverage is exact only for nodes supplied to gm's replay evaluator; it makes no claim about unrecorded branches.
- Candidate-policy application remains governed by the existing GM and tool-authorization paths; this plugin supplies model context only.
- An optional overlay must mount both `@freddie/freddie-tool-gm` and this package for the context to observe a local replay result.
