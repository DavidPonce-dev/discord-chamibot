import { describe, it, expect, vi, afterEach } from "vitest"
import { createYouTubeSearch } from "@/infra/youtube/search"
import type { CookieStorePort, LoggerPort } from "@/domain/ports"

vi.mock("@/infra/youtube/ytdlp", () => ({
  searchYtDlp: vi.fn(),
  buildYtDlpArgs: vi.fn(),
  spawnYtDlp: vi.fn(),
}))

vi.mock("play-dl", () => ({
  default: {
    search: vi.fn(),
    video_info: vi.fn(),
    playlist_info: vi.fn(),
  },
}))

import { searchYtDlp } from "@/infra/youtube/ytdlp"
import play from "play-dl"

const mockCookieStore = (filePath: string | null): CookieStorePort => ({
  read: () => null,
  write: () => {},
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => filePath,
})

const mockLogger: LoggerPort = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  event: () => {},
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("infra/youtube/search", () => {
  it("strips leading emoji and falls back to play-dl when yt-dlp search is empty", async () => {
    vi.mocked(searchYtDlp).mockResolvedValueOnce([])
    vi.mocked(play.search).mockResolvedValueOnce([
      { id: "vid1", url: "https://youtube.com/watch?v=vid1", title: "Fallback Song", durationRaw: "3:30" },
    ] as never)

    const search = createYouTubeSearch(mockCookieStore(null), mockLogger)
    const result = await search.resolveQuery("\u{1F50E} discipline king crimson")

    expect(searchYtDlp).toHaveBeenCalledWith("discipline king crimson", 1, expect.anything())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tracks[0].title).toBe("Fallback Song")
  })

  it("returns first yt-dlp result for text queries", async () => {
    vi.mocked(searchYtDlp).mockResolvedValueOnce([
      { id: "a1", url: "https://youtube.com/watch?v=a1", title: "Song One", duration: 240 },
    ] as never)

    const search = createYouTubeSearch(mockCookieStore(null), mockLogger)
    const result = await search.resolveQuery("queen")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tracks[0].title).toBe("Song One")
      expect(result.value.tracks[0].duration).toBe("4:00")
    }
  })

  it("returns 'Sin resultados' when both sources fail", async () => {
    vi.mocked(searchYtDlp).mockResolvedValueOnce([])
    vi.mocked(play.search).mockRejectedValueOnce(new Error("network"))

    const search = createYouTubeSearch(mockCookieStore(null), mockLogger)
    const result = await search.resolveQuery("queen")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("Sin resultados")
  })

  it("returns empty immediately for URL queries in autocomplete", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    const search = createYouTubeSearch(mockCookieStore(null), mockLogger)
    const result = await search.autocomplete("https://youtube.com/watch?v=abc")

    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("delegates to suggestions provider for text queries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(["queen", ["queen songs", "queen live"]]), { status: 200 }),
    ))

    const search = createYouTubeSearch(mockCookieStore(null), mockLogger)
    const result = await search.autocomplete("queen")

    expect(result).toHaveLength(2)
    expect(result[0].value).toBe("queen songs")
  })
})
