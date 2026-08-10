import type { Ports } from "../domain/ports"
import type { AutocompleteChoice } from "../domain/types"

export type SearchUseCases = Readonly<{
  autocomplete: (query: string) => Promise<readonly AutocompleteChoice[]>
}>

export const createSearchUseCases = (ports: Ports): SearchUseCases => ({
  autocomplete: (query: string): Promise<readonly AutocompleteChoice[]> =>
    ports.search.autocomplete(query),
})
