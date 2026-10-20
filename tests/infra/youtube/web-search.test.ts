import { describe, it, expect, vi, afterEach } from "vitest"
import { parseSearchPage, searchYouTubeWeb } from "@/infra/youtube/web-search"

const video = (id: string, title: string, length?: string) => ({
  videoRenderer: {
    videoId: id,
    title: { runs: [{ text: title }] },
    ...(length ? { lengthText: { simpleText: length } } : {}),
  },
})

const page = (data: unknown): string =>
  `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("infra/youtube/web-search", () => {
  it("extracts videos wherever they are nested in ytInitialData", () => {
    const html = page({
      contents: { sections: [{ items: [video("a1", "Song A", "3:21"), { shelf: { items: [video("b2", "Song B", "4:05")] } }] }] },
    })
    expect(parseSearchPage(html, 10)).toEqual([
      { id: "a1", title: "Song A", url: "https://www.youtube.com/watch?v=a1", durationRaw: "3:21" },
      { id: "b2", title: "Song B", url: "https://www.youtube.com/watch?v=b2", durationRaw: "4:05" },
    ])
  })

  it("skips live streams (no length) and respects the limit", () => {
    const html = page({ items: [video("live", "Live now"), video("a", "A", "1:00"), video("b", "B", "2:00"), video("c", "C", "3:00")] })
    const results = parseSearchPage(html, 2)
    expect(results.map(r => r.id)).toEqual(["a", "b"])
  })

  it("returns [] when the page has no ytInitialData (consent page, captcha, layout change)", () => {
    expect(parseSearchPage("<html>consent</html>", 10)).toEqual([])
    expect(parseSearchPage("var ytInitialData = {broken;</script>", 10)).toEqual([])
  })

  it("returns [] on HTTP or network errors so callers can fall back to yt-dlp", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })))
    expect(await searchYouTubeWeb("queen", 5)).toEqual([])

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))
    expect(await searchYouTubeWeb("queen", 5)).toEqual([])
  })

  it("requests the videos-only results page", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(page({ items: [video("a", "A", "1:00")] }), { status: 200 }))
    vi.stubGlobal("fetch", fetch)
    const results = await searchYouTubeWeb("daft punk", 5)
    expect(results).toHaveLength(1)
    const url = String(fetch.mock.calls[0][0])
    expect(url).toContain("search_query=daft%20punk")
    expect(url).toContain("sp=EgIQAQ%3D%3D")
  })
})
