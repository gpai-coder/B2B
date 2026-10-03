import type { SearchContext, SearchHit, SearchQueryInput, SearchResult } from './types'

export interface SearchProvider {
  search(input: SearchQueryInput, ctx: SearchContext): Promise<SearchResult>
  suggest(q: string, limit: number, ctx: SearchContext): Promise<SearchHit[]>
}
