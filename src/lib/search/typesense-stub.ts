import type { SearchProvider } from './provider'
import type { SearchContext, SearchHit, SearchQueryInput, SearchResult } from './types'

/** Placeholder until Typesense is wired; Postgres is the active provider. */
export class TypesenseSearchProvider implements SearchProvider {
  search(_input: SearchQueryInput, _ctx: SearchContext): Promise<SearchResult> {
    return Promise.reject(new Error('Typesense search is not configured'))
  }

  suggest(_q: string, _limit: number, _ctx: SearchContext): Promise<SearchHit[]> {
    return Promise.reject(new Error('Typesense search is not configured'))
  }
}
