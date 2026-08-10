import type { AutocompleteChoice } from "../../domain/types"
import { AUTOCOMPLETE_CACHE_MS, AUTOCOMPLETE_SUGGEST_TIMEOUT_MS } from "../../config/timeouts"

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search"

const parseSuggestionResponse = (raw: unknown): string[] => {
  if (!Array.isArray(raw) || raw.length < 2) return []
  const suggestions = raw[1]
  if (!Array.isArray(suggestions)) return []
  return suggestions
    .filter((s): s is string => typeof s === "string")
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

const toChoice = (suggestion: string): AutocompleteChoice => {
  const prefixed = `\u{1F50E} ${suggestion}`
  return {
    name: prefixed.length > 100 ? prefixed.slice(0, 97) + "..." : prefixed,
    value: suggestion,
  }
}

const fetchSuggestions = async (query: string): Promise<string[]> => {
  const url = new URL(SUGGEST_URL)
  url.searchParams.set("client", "firefox")
  url.searchParams.set("ds", "yt")
  url.searchParams.set("hl", "es")
  url.searchParams.set("q", query)

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(AUTOCOMPLETE_SUGGEST_TIMEOUT_MS),
  })
  if (!response.ok) return []
  const data = await response.json() as unknown
  return parseSuggestionResponse(data)
}

export const createSuggestionProvider = (): {
  suggestions: (query: string) => Promise<readonly AutocompleteChoice[]>
} => {
  const cache = new Map<string, { readonly expiresAt: number; readonly choices: readonly AutocompleteChoice[] }>()

  const suggestions = async (query: string): Promise<readonly AutocompleteChoice[]> => {
    const q = query.trim()
    if (!q) return []

    const cached = cache.get(q.toLowerCase())
    if (cached && cached.expiresAt > Date.now()) return cached.choices

    let choices: readonly AutocompleteChoice[] = []
    try {
      const list = await fetchSuggestions(q)
      choices = list.slice(0, 10).map(toChoice)
    } catch {
      choices = []
    }

    if (choices.length > 0) {
      cache.set(q.toLowerCase(), { expiresAt: Date.now() + AUTOCOMPLETE_CACHE_MS, choices })
    }
    return choices
  }

  return { suggestions } as const
}
