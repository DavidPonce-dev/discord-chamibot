import { describe, it, expect, vi, afterEach } from "vitest"
import { createSuggestionProvider, SUGGESTION_CACHE_MAX_ENTRIES } from "@/infra/youtube/suggestions"

const fetchEcho = (): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get("q")
    return new Response(JSON.stringify([q, [`${q} song`]]), { status: 200 })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("infra/youtube/suggestions cache", () => {
  it("reuses a recent answer for the same text", async () => {
    const fetch = fetchEcho()
    const provider = createSuggestionProvider()
    await provider.suggestions("queen")
    await provider.suggestions("Queen")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // Every keystroke is a new key: without a limit the cache grew for as long as the bot ran
  it("forgets the oldest entries once it is full", async () => {
    const fetch = fetchEcho()
    const provider = createSuggestionProvider()
    for (let i = 0; i <= SUGGESTION_CACHE_MAX_ENTRIES; i++) await provider.suggestions(`query ${i}`)
    fetch.mockClear()

    await provider.suggestions(`query ${SUGGESTION_CACHE_MAX_ENTRIES}`)
    expect(fetch).not.toHaveBeenCalled()
    await provider.suggestions("query 0")
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
