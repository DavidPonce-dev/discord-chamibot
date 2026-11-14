import { describe, it, expect, vi, afterEach } from "vitest"
import { createYouTubeSearch } from "@/infra/youtube/search"
import { createAudioUrlCache } from "@/infra/youtube/audio-url-cache"
import type { CookieStorePort } from "@/domain/ports"

vi.mock("@/infra/youtube/ytdlp", () => ({
  searchYtDlp: vi.fn(),
  listYtDlpPlaylist: vi.fn(),
  buildYtDlpArgs: vi.fn(),
  spawnYtDlp: vi.fn(),
  AUDIO_FORMAT: "bestaudio",
  USER_AGENT: "test-agent",
}))

import { searchYtDlp, listYtDlpPlaylist, buildYtDlpArgs, spawnYtDlp } from "@/infra/youtube/ytdlp"

const mockCookieStore = (filePath: string | null): CookieStorePort => ({
  read: () => null,
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => filePath,
})

// The single-video path spawns yt-dlp for the video's metadata
const mockVideoInfo = (info: Record<string, unknown>) => {
  vi.mocked(buildYtDlpArgs).mockImplementation((base: string[]) => [...base])
  vi.mocked(spawnYtDlp).mockResolvedValue({ code: 0, stdout: JSON.stringify(info), stderr: "" })
}

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe("infra/youtube/search", () => {
  it("strips leading emoji and retries with a flat search when the full one is empty", async () => {
    vi.mocked(searchYtDlp)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "vid1", url: "https://youtube.com/watch?v=vid1", title: "Fallback Song", duration: 210 }] as never)

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.resolveQuery("\u{1F50E} discipline king crimson")

    expect(searchYtDlp).toHaveBeenCalledWith("discipline king crimson", 1, expect.anything(), expect.objectContaining({ format: "bestaudio" }))
    expect(searchYtDlp).toHaveBeenCalledWith("discipline king crimson", 1, expect.anything())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tracks[0].title).toBe("Fallback Song")
  })

  it("returns first yt-dlp result for text queries", async () => {
    vi.mocked(searchYtDlp).mockResolvedValueOnce([
      { id: "a1", url: "https://youtube.com/watch?v=a1", title: "Song One", duration: 240 },
    ] as never)

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.resolveQuery("queen")

    expect(searchYtDlp).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tracks[0].title).toBe("Song One")
      expect(result.value.tracks[0].duration).toBe("4:00")
    }
  })

  it("stores the stream URL from the search in the audio cache", async () => {
    const audioUrl = "https://rr1---sn-x.googlevideo.com/videoplayback?expire=9999999999"
    vi.mocked(searchYtDlp).mockResolvedValueOnce([
      { id: "a1", url: "https://www.youtube.com/watch?v=a1", title: "Song One", duration: 240, audioUrl },
    ] as never)
    const cache = createAudioUrlCache()

    const search = createYouTubeSearch(mockCookieStore(null), cache)
    await search.resolveQuery("queen")

    expect(cache.get("https://youtube.com/watch?v=a1")).toBe(audioUrl)
  })

  it("returns 'Sin resultados' when yt-dlp finds nothing", async () => {
    vi.mocked(searchYtDlp).mockResolvedValue([])

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.resolveQuery("queen")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Sin resultados")
  })

  describe("playlists", () => {
    const entries = [
      { id: "p1", url: "https://www.youtube.com/watch?v=p1", title: "Peso Pluma - Bellakeo", duration: 235, channel: "Peso Pluma", playlistTitle: "Popular Music Videos" },
      { id: "p2", url: "https://www.youtube.com/watch?v=p2", title: "Arcangel - FN8", duration: 650, channel: "Arcangel", playlistTitle: "Popular Music Videos" },
    ]

    it("queues every video of a playlist URL", async () => {
      vi.mocked(listYtDlpPlaylist).mockResolvedValueOnce(entries as never)

      const search = createYouTubeSearch(mockCookieStore(null))
      const result = await search.resolveQuery("https://www.youtube.com/playlist?list=PL123")

      expect(listYtDlpPlaylist).toHaveBeenCalledWith("https://www.youtube.com/playlist?list=PL123", 50, expect.anything())
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.playlistTitle).toBe("Popular Music Videos")
        expect(result.value.tracks).toEqual([
          { url: "https://www.youtube.com/watch?v=p1", title: "Peso Pluma - Bellakeo", duration: "3:55", id: "p1", thumbnail: "https://img.youtube.com/vi/p1/hqdefault.jpg", channel: "Peso Pluma" },
          { url: "https://www.youtube.com/watch?v=p2", title: "Arcangel - FN8", duration: "10:50", id: "p2", thumbnail: "https://img.youtube.com/vi/p2/hqdefault.jpg", channel: "Arcangel" },
        ])
      }
    })

    it("queues the playlist when the URL is a video opened inside one", async () => {
      vi.mocked(listYtDlpPlaylist).mockResolvedValueOnce(entries as never)

      const search = createYouTubeSearch(mockCookieStore(null))
      const result = await search.resolveQuery("https://www.youtube.com/watch?v=p1&list=PL123")

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.tracks).toHaveLength(2)
    })

    it("falls back to the video itself when the playlist can't be listed", async () => {
      vi.mocked(listYtDlpPlaylist).mockResolvedValueOnce([])
      mockVideoInfo({ id: "p1", title: "Only This One", duration: 200 })

      const search = createYouTubeSearch(mockCookieStore(null))
      const result = await search.resolveQuery("https://www.youtube.com/watch?v=p1&list=PL123")

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.tracks.map(t => t.title)).toEqual(["Only This One"])
    })

    // Copying a link while YouTube autoplays a "Mix" adds list=RD...: the user means that one video
    it("plays just the video when the list is an auto-generated mix", async () => {
      mockVideoInfo({ id: "p1", title: "Just This Song", duration: 200 })

      const search = createYouTubeSearch(mockCookieStore(null))
      const result = await search.resolveQuery("https://www.youtube.com/watch?v=p1&list=RDp1&start_radio=1")

      expect(listYtDlpPlaylist).not.toHaveBeenCalled()
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.tracks.map(t => t.title)).toEqual(["Just This Song"])
    })

    it("reports an error when a playlist-only URL can't be listed", async () => {
      vi.mocked(listYtDlpPlaylist).mockResolvedValueOnce([])

      const search = createYouTubeSearch(mockCookieStore(null))
      const result = await search.resolveQuery("https://www.youtube.com/playlist?list=PL123")

      expect(result.ok).toBe(false)
    })
  })

  it("reports an error instead of throwing on a malformed URL", async () => {
    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.resolveQuery("http://")
    expect(result.ok).toBe(false)
  })

  it("reports an error when the video info can't be read", async () => {
    vi.mocked(buildYtDlpArgs).mockImplementation((base: string[]) => [...base])
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: 1, stdout: "", stderr: "ERROR: Video unavailable" })

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.resolveQuery("https://www.youtube.com/watch?v=gone")

    expect(result.ok).toBe(false)
  })

  it("searchVideos uses the in-process web search without spawning yt-dlp", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      `<script>var ytInitialData = ${JSON.stringify({ items: [{ videoRenderer: { videoId: "w1", title: { runs: [{ text: "Web Song" }] }, lengthText: { simpleText: "3:00" } } }] })};</script>`,
      { status: 200 },
    )))

    const search = createYouTubeSearch(mockCookieStore(null))
    const results = await search.searchVideos("daft punk", 15)

    expect(results[0]).toMatchObject({ id: "w1", title: "Web Song", durationRaw: "3:00" })
    expect(searchYtDlp).not.toHaveBeenCalled()
  })

  it("searchVideos falls back to yt-dlp when the web search finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>consent</html>", { status: 200 })))
    vi.mocked(searchYtDlp).mockResolvedValueOnce([
      { id: "y1", url: "https://youtube.com/watch?v=y1", title: "Ytdlp Song", duration: 180 },
    ] as never)

    const search = createYouTubeSearch(mockCookieStore(null))
    const results = await search.searchVideos("daft punk", 15)

    expect(results[0]).toMatchObject({ id: "y1", durationRaw: "3:00" })
  })

  it("returns empty immediately for URL queries in autocomplete", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.autocomplete("https://youtube.com/watch?v=abc")

    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("delegates to suggestions provider for text queries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(["queen", ["queen songs", "queen live"]]), { status: 200 }),
    ))

    const search = createYouTubeSearch(mockCookieStore(null))
    const result = await search.autocomplete("queen")

    expect(result).toHaveLength(2)
    expect(result[0].value).toBe("queen songs")
  })
})
