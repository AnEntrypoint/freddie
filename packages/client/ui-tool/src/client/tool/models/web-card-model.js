
export function webCardModel(block) {
  if (!('kind' in block)) return null
  const result = block.resultView
  if (result?.card !== 'web') return null
  if (result.kind === 'search') {
    return {
      kind: 'search',
      answer: result.answer,
      sources: result.sources.map(source => ({
        url: source.url,
        title: source.title,
        snippet: source.snippet,
        publishedAt: source.publishedAt,
      })),
      truncated: result.truncated,
    }
  }
  if (result.kind === 'fetch') {
    return {
      kind: 'fetch',
      url: result.url,
      statusCode: result.statusCode,
      truncated: result.truncated,
    }
  }
  return null
}
