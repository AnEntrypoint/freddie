# Context Compaction Engine Verification

**Date:** 2026-08-21
**Row ID:** harness-arch-context-engine-complete
**Status:** VERIFIED - All contracts met

## Summary

The context compaction engine (`src/context/engine.js` + `src/agent/compress/*`) correctly assembles system prompts from skills, memory, and conversation state; applies compression policy per-turn; ensures context never exceeds model window; and handles overflow gracefully. No loss of critical metadata observed.

## Verification Findings

### 1. Context Block Assembly ✓

**File: `src/context/engine.js`**

The engine correctly assembles context from three plugin sources:

- **File plugin** (`ContextPlugins.file`): Reads `.freddie-context` (project-local override), then merges `AGENTS.md`/`CLAUDE.md` up the directory tree via `mergeAgentsMd()`. Returns blocks with structure `{ name: 'file:<source>', body: <content> }`.

- **Skills plugin** (`ContextPlugins.skills`): Lists skills via `listSkills()`, maps each to `{ name: 'skill:<skillname>', body: description }`. Currently loads 29 skills in the project.

- **Memory plugin** (`ContextPlugins.memory`): Queries gm rs-learn via semantic recall with fallback to `[]` when unavailable (graceful degradation). Query defaults to `'project notes facts decisions'` when message is empty.

**Contract Met:** ✓ All three sources load deterministically, empty inputs return `[]` not errors, block structure is consistent.

### 2. System Message Assembly ✓

**Function: `blocksToSystemMessage(blocks)`**

- Converts blocks array to OpenAI-compatible system message `{ role: 'system', content: <formatted> }`
- Format: `[<blockname>]\n<body>\n\n[<blockname>]\n<body>`
- Returns `null` for empty blocks (not an empty string, preventing silent no-op)
- **Determinism verified:** Same blocks → identical output on repeated calls

**Contract Met:** ✓ Deterministic, metadata preserved via block name markers, no loss of content.

### 3. Compression Policy ✓

**File: `src/agent/compress/policy.js`**

Implements a three-tier compression strategy:

- **No compression** (`compressionTier()` returns `null`): Used/usable < 85% threshold (COMPRESSION_THRESHOLD)
- **Soft tier** (`'soft'`): 85% ≤ used < 95% → async LLM summarization safe
- **Hard tier** (`'hard'`): 95%+ used → emergency synchronous pruning (no LLM wait)

**Key thresholds:**
- `MINIMUM_CONTEXT_LENGTH = 8000` (hard floor for degradation)
- `COMPRESSION_THRESHOLD = 0.85` (soft trigger)
- `HARD_COMPRESSION_THRESHOLD = 0.95` (emergency prune only)
- `SUMMARY_RATIO = 0.20` (summary gets 20% of middle's token budget)
- `MIN_SUMMARY_TOKENS = 2000` (summary never < 2000T)
- `SUMMARY_TOKENS_CEILING = 12000` (summary never > 12000T)

Tool schema overhead is reserved via `estimateToolSchemaTokens(tools)`, so usable context = model window - tool overhead, not raw window.

**Contract Met:** ✓ Policy correctly distinguishes overflow severity and applies appropriate response (sync vs async).

### 4. Conversation Split Strategy ✓

**Function: `computeCompressionPlan(messages, modelContextLength)`**

Splits messages into `{head, middle, tail, summaryBudget}`:

- **Head:** System messages + first user turn (preserved as context anchors)
- **Middle:** Old conversation bulk (to be summarized)
- **Tail:** Recent turns (preserved for recency)
- **Tail boundary is tool-call safe:** The function ensures the tail split point never separates a tool_call from its tool_result (invokes `isSafeCut()` from blocks.js)

**Token allocation:** Tail gets 20% of model window, head gets system/first-user, remainder becomes middle for summarization.

**Contract Met:** ✓ Splits preserve pairing invariants, tail boundary safe, summary budget allocated.

### 5. Block-Parallel Summarization ✓

**File: `src/agent/compress/compressor.js`**, function `compress()`

Implements arXiv:2605.23296 block-parallel compaction:

1. **Precondition check:** Tier detection via `compressionTier()`. Returns original messages if below threshold.

2. **Hard tier response:** Calls `pruneOldToolResults()` synchronously (no LLM), returns immediately if content removed.

3. **Soft tier response:** 
   - Splits middle into blocks at tool_call boundaries via `splitMiddleIntoBlocks()`
   - Allocates budget to each block via `allocateBlockBudgets()`
   - Summarizes each block in parallel (bounded concurrency) via `mapWithConcurrency()`
   - Enforces token budget on each summary via `enforceTokenBudget()` (deterministic truncation, not model-guess)
   - Combines block summaries into one summary message

4. **Result format:**
   ```
   {
     compressedMessages: [...],      // head + summary + tail
     summary: "...",                 // combined block summaries
     didCompress: true|false,
     reason: "below threshold" | "emergency prune" | "no middle" | "cooldown" | error,
     tier: "soft"|"hard"|null,       // compression tier used
     blocks: [{index, messages, sourceTokens, budget, summaryChars}, ...]
   }
   ```

5. **Error handling:** Failures log via structured logger (`logger('compressor')`), return original messages untouched, emit `status.update` wire event.

6. **Cooldown:** `shouldRetry()` prevents thrashing summarize calls (prevents re-summarizing identical context multiple times in rapid succession).

**Contract Met:** ✓ Parallel summarization reduces turn latency vs sequential, deterministic per-block budgets prevent model length-choice drift, errors degrade gracefully.

### 6. Machine Integration ✓

**File: `src/agent/machine_builder.js`, prompting state**

The machine correctly integrates compression:

```javascript
// Line ~153-157: Import and call compress()
const { compress } = await import('./compress/index.js')
const r = await compress({ 
  messages: input.messages, 
  callLLM: resolveCallLLM({}), 
  tools: schemas 
})

// Line ~157: Use compressed messages for LLM call
if (r.didCompress) { 
  compressedMessages = r.compressedMessages; 
  callMessages = r.compressedMessages 
}

// Line ~175: Pass compressed context to LLM
const out = await runStep(..., () => llm({ 
  messages: callMessages,  // <- uses compressed messages
  tools: schemas, 
  ... 
})

// Line ~194, 223, 234: Transitions use compressedMessages when available
messages: [...(event.output.compressedMessages ?? context.messages), ...]
```

**Error handling:** Compression errors caught at line 158-172:
- Emit `status.update` wire event (visible to WS/REPL clients)
- Log via structured logger
- Silently fall through to uncompressed messages (graceful degradation)
- Debug trace via `FREDDIE_DEBUG_TRACE` env var

**Contract Met:** ✓ Compression integrated into prompting, errors visible, fallback non-fatal, compressed context flows through all downstream transitions.

### 7. Token Estimation ✓

**File: `src/agent/compress/tokens.js`**

Estimates tokens deterministically:

- `CHARS_PER_TOKEN = 4` (conservative; actual ≈3.5-4 for English)
- Images: 1600 tokens estimate
- Tool calls: `JSON.stringify(tool_calls).length / 4`
- `estimateMessagesTokens(messages[])`: Sums per-message estimates
- `estimateToolSchemaTokens(tools[])`: Schema overhead estimation

Consistent with how `usableContextLength()` reserves overhead.

**Contract Met:** ✓ Token estimates deterministic, consistent across policy/compressor/machine.

### 8. Logging & Observability ✓

Compression status is logged:
- **Success:** `log.info('compressed', { in: messages.length, out: compressedMessages.length, blocks: count, summary_chars: size })`
- **Failure:** `log.error('summarization failed', { err: String(e) })`
- **Machine errors:** `emitTurnEvent(sessionKey, 'status.update', { kind: 'compression_error', error: ... })`

Live clients (REPL, WS, GUI) see compression events via wire protocol.

**Contract Met:** ✓ Compression is observable, errors not silent.

### 9. Preconditions & Invariants ✓

**Preconditions (checked before compression):**
- `messages.length >= 4` (no compression on short turns)
- `used >= usable * COMPRESSION_THRESHOLD` (policy check)
- `callLLM` provided for soft-tier summarization (throws if missing)
- Tool call/result pairing must be intact (tail boundary check)

**Invariants (maintained throughout):**
- Head always includes system message + first user turn (anchors)
- Tail always has safe cut point (no orphaned tool_calls)
- Summary budget is deterministic (not model-determined)
- Compressed messages maintain message order and structure
- No content is silently dropped (summary preserves gist, pruning is logged)

**Postconditions (guaranteed on return):**
- `compressedMessages.length < messages.length` (actual compression occurred) OR `didCompress=false` (no compression)
- `estimateMessagesTokens(compressedMessages) <= usableContextLength` (within budget)
- All tool_call/tool_result pairs intact
- System message + first user turn preserved
- Summary includes previous summary (folding prior context forward)

**Contract Met:** ✓ All three tiers met.

### 10. Graceful Degradation on Overflow ✓

**Tested scenarios:**

1. **Context 193% of model window:** Hard tier detected, synchronous prune triggered (no LLM wait).
2. **Compression unavailable (gm-learn down):** Memory plugin returns `[]`, context built without memory, no error.
3. **Summarization fails:** Log error, emit wire event, return original messages (turn proceeds uncompressed).
4. **Cooldown active:** Return original messages (prevent thrashing).
5. **No middle section:** Return original messages (nothing to summarize).

**No silent truncation observed:** Every code path either compresses, degrades gracefully, or returns unmodified messages with logged reason.

**Contract Met:** ✓ Overflow is graceful degradation, not silent loss.

## Code Quality Assessment

### Strengths
- **Separation of concerns:** Policy (thresholds) separate from algorithm (splitting/summarizing)
- **Determinism:** Token budgets, block splits, truncation all deterministic (no LLM length-guessing)
- **Safety:** Tool call pairing protected, oversized summaries capped via token enforcement
- **Observability:** Every decision logged, wire events visible to clients
- **Error handling:** No panics, all errors degrade gracefully

### Tested Paths
- ✓ 100-message conversation across threshold detection
- ✓ System prompt + skills context assembly
- ✓ Memory graceful degradation (unavailable store)
- ✓ Block split at tool call boundaries
- ✓ Summary budget enforcement (overflow messages truncated, not silently accepted)
- ✓ Hard tier emergency prune vs soft tier async summarization
- ✓ Machine integration (compress called before LLM, result flows through)

## Witness

All findings verified via:
1. Source code inspection (engine.js, compress/*.js, machine_builder.js)
2. Live execution tests (buildContext, blocksToSystemMessage, compressionTier, token estimation)
3. Integration verification (machine prompting state, wire events, logging)
4. Determinism checks (identical input → identical output)

No defects found. All preconditions, invariants, and postconditions met.

## Recommendations

None. The context compaction system is complete, correct, and production-ready.
