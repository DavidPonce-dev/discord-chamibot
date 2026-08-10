import { describe, it, expect, vi, afterEach } from "vitest"
import { createSuggestionProvider } from "@/infra/youtube/suggestions"

const mockFetch = (payload: unknown): ReturnType<typeof vi.fn> => {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
  )
  vi.stubGlobal("fetch", fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("infra/youtube/suggestions", () => {
  it("returns empty array for empty query without fetching", async () => {
    const fetch = mockFetch([])
    const provider = createSuggestionProvider()
    expect(await provider.suggestions("   ")).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("maps response suggestions to autocomplete choices", async () => {
    mockFetch(["queen", ["queen bohemian rhapsody", "queen live aid", "queen greatest hits"]])
    const provider = createSuggestionProvider()
    const result = await provider.suggestions("queen")

    expect(result).toHaveLength(3)
    expect(result[0].name).toBe("\u{1F50E} queen bohemian rhapsody")
    expect(result[0].value).toBe("queen bohemian rhapsody")
  })

  it("caps suggestions at 10", async () => {
    const suggestions = Array.from({ length: 15 }, (_, i) => `suggestion ${i}`)
    mockFetch(["q", suggestions])
    const provider = createSuggestionProvider()
    const result = await provider.suggestions("q")
    expect(result).toHaveLength(10)
  })

  it("truncates names longer than 100 chars", async () => {
    const long = "a".repeat(150)
    mockFetch(["q", [long]])
    const provider = createSuggestionProvider()
    const result = await provider.suggestions("q")
    expect(result[0].name.length).toBe(100)
    expect(result[0].name.endsWith("...")).toBe(true)
  })

  it("caches results and does not refetch the same query", async () => {
    const fetch = mockFetch(["queen", ["queen songs"]])
    const provider = createSuggestionProvider()

    await provider.suggestions("Queen")
    await provider.suggestions("queen")

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("returns empty array on network error", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", fetch)
    const provider = createSuggestionProvider()
    expect(await provider.suggestions("queen")).toEqual([])
  })

  it("returns empty array on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 500 })))
    const provider = createSuggestionProvider()
    expect(await provider.suggestions("queen")).toEqual([])
  })

  it("returns empty array on malformed payload", async () => {
    mockFetch({ not: "an array" })
    const provider = createSuggestionProvider()
    expect(await provider.suggestions("queen")).toEqual([])
  })
})
