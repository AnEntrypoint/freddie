
const balanceCacheBySession = new WeakMap()

function eventDelta(event) {
  switch (event.type) {
    case 'assistant/message':
      return event.data.message.content.filter(block => block.type === 'tool-call').length
    case 'tool/result':
      return -1
    default:
      return 0
  }
}

function eventForSeq(events, seq) {
  const event = events[seq]
  if (event === undefined || event.seq !== seq) {
    throw new Error(`tool-pairing balance: surface seq ${seq} has no matching session event (corrupt surface)`)
  }
  return event
}

function extendCache(
  session,
  cache,
  seqs,
) {
  const processed = cache.cutBalanced.length - 1
  const tail = seqs.slice(processed)
  const events = session.events
  const pendingCuts = []
  let inProgressToolCalls = cache.inProgressToolCalls
  for (const seq of tail) {
    inProgressToolCalls += eventDelta(eventForSeq(events, seq))
    if (inProgressToolCalls < 0) {
      throw new Error(`tool-pairing balance: tool/result at surface seq ${seq} has no matching tool-call (corrupt surface)`)
    }
    pendingCuts.push(inProgressToolCalls === 0)
  }

  tail.forEach((seq, offset) => cache.indexBySeq.set(seq, processed + offset))
  cache.cutBalanced = cache.cutBalanced.concat(pendingCuts)
  cache.inProgressToolCalls = inProgressToolCalls
  return cache
}

function balanceCache(session) {
  const surface = session.surface
  const seqs = surface.nodes
  const generation = surface.replaceGeneration
  const cached = balanceCacheBySession.get(session)

  if (cached === undefined || cached.generation !== generation || cached.cutBalanced.length - 1 > seqs.length) {
    const rebuilt = extendCache(session, {
      generation,
      cutBalanced: [true],
      indexBySeq: new Map(),
      inProgressToolCalls: 0,
    }, seqs)
    balanceCacheBySession.set(session, rebuilt)
    return rebuilt
  }
  if (cached.cutBalanced.length - 1 < seqs.length) return extendCache(session, cached, seqs)
  return cached
}

function cutBalance(cache, seq, offset) {
  const index = cache.indexBySeq.get(seq)
  const balanced = index === undefined ? undefined : cache.cutBalanced[index + offset]
  if (balanced === undefined) {
    throw new Error(`tool-pairing balance: surface seq ${seq} not found`)
  }
  return balanced
}

export function toolPairingBalancedBefore(session, seq) {
  return cutBalance(balanceCache(session), seq, 0)
}

export function toolPairingBalancedAfter(session, seq) {
  return cutBalance(balanceCache(session), seq, 1)
}
