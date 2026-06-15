import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSearch = vi.hoisted(() => vi.fn())
const mockVideoInfo = vi.hoisted(() => vi.fn())
const mockPlaylistInfo = vi.hoisted(() => vi.fn())
const mockSpawnYtDlp = vi.hoisted(() => vi.fn())
const mockBuildYtDlpArgs = vi.hoisted(() => vi.fn((args) => [...args]))
const mockFormatTime = vi.hoisted(() => vi.fn((s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`))
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  event: vi.fn(),
  info: vi.fn(),
}))

vi.mock("play-dl", () => ({
  default: {
    search: mockSearch,
    video_info: mockVideoInfo,
    playlist_info: mockPlaylistInfo,
  },
  search: mockSearch,
  video_info: mockVideoInfo,
  playlist_info: mockPlaylistInfo,
}))

vi.mock("@/utils/ytdlp", () => ({
  spawnYtDlp: mockSpawnYtDlp,
  buildYtDlpArgs: mockBuildYtDlpArgs,
  USER_AGENT: "test-agent",
}))

vi.mock("@/utils/format", () => ({
  formatTime: mockFormatTime,
}))

vi.mock("@/utils/logger", () => ({
  logger: mockLogger,
}))

const { resolveQuery, autocompleteSearch } = await import("@/services/search/YouTubeResolver")

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "vid123",
    title: "Test Video",
    url: "https://youtube.com/watch?v=vid123",
    durationRaw: "3:30",
    ...overrides,
  }
}

function makePlaylist(overrides: Record<string, unknown> = {}) {
  return {
    id: "pl123",
    title: "Test Playlist",
    url: "https://youtube.com/playlist?list=pl123",
    videoCount: 10,
    ...overrides,
  }
}

describe("resolveQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("URL directa - video", () => {
    it("yt-dlp resuelve → retorna track con info", async () => {
      mockSpawnYtDlp.mockResolvedValue({
        stdout: JSON.stringify({ title: "Song Title", duration: 210, id: "abc123" }),
        stderr: "",
        code: 0,
      })

      const result = await resolveQuery("https://youtube.com/watch?v=abc123")

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0].title).toBe("Song Title")
      expect(result.tracks[0].id).toBe("abc123")
    })

    it("yt-dlp falla → fallback a play-dl video_info", async () => {
      mockSpawnYtDlp.mockResolvedValue({ stdout: "", stderr: "failed", code: 1 })
      mockVideoInfo.mockResolvedValue({
        video_details: {
          id: "abc123",
          title: "Fallback Title",
          durationRaw: "4:20",
        },
      })

      const result = await resolveQuery("https://youtube.com/watch?v=abc123")

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0].title).toBe("Fallback Title")
      expect(mockVideoInfo).toHaveBeenCalled()
    })

    it("yt-dlp y play-dl fallan → lanza error con mensaje de cookies", async () => {
      mockSpawnYtDlp.mockResolvedValue({ stdout: "", stderr: "failed", code: 1 })
      mockVideoInfo.mockRejectedValue(new Error("blocked"))

      await expect(resolveQuery("https://youtube.com/watch?v=abc123")).rejects.toThrow(
        "admin panel"
      )
    })
  })

  describe("URL directa - playlist", () => {
    it("playlist URL → resuelve via playlist_info", async () => {
      const mockVideos = [
        { id: "v1", title: "Track 1", url: "https://youtube.com/watch?v=v1", durationRaw: "3:00" },
        { id: "v2", title: "Track 2", url: "https://youtube.com/watch?v=v2", durationRaw: "4:00" },
      ]
      mockPlaylistInfo.mockResolvedValue({
        title: "My Playlist",
        all_videos: vi.fn().mockResolvedValue(mockVideos),
      })

      const result = await resolveQuery("https://youtube.com/playlist?list=PLabc123")

      expect(result.tracks).toHaveLength(2)
      expect(result.playlistTitle).toBe("My Playlist")
      expect(result.tracks[0].title).toBe("Track 1")
    })

    it("playlist_info falla → fallback a video single", async () => {
      mockPlaylistInfo.mockRejectedValue(new Error("playlist error"))
      mockSpawnYtDlp.mockResolvedValue({
        stdout: JSON.stringify({ title: "Single Video", duration: 180, id: "abc123" }),
        stderr: "",
        code: 0,
      })

      const result = await resolveQuery("https://youtube.com/playlist?list=PLabc123")

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0].title).toBe("Single Video")
    })

    it("limita a 50 tracks máximo", async () => {
      const manyVideos = Array.from({ length: 60 }, (_, i) => ({
        id: `v${i}`,
        title: `Track ${i}`,
        url: `https://youtube.com/watch?v=v${i}`,
        durationRaw: "3:00",
      }))
      mockPlaylistInfo.mockResolvedValue({
        title: "Big Playlist",
        all_videos: vi.fn().mockResolvedValue(manyVideos),
      })

      const result = await resolveQuery("https://youtube.com/playlist?list=PLbig")

      expect(result.tracks).toHaveLength(50)
    })
  })

  describe("búsqueda por texto", () => {
    it("query sin URL → busca via play-dl.search", async () => {
      mockSearch.mockResolvedValue([makeVideo({ title: "Found Song" })])

      const result = await resolveQuery("my favorite song")

      expect(mockSearch).toHaveBeenCalledWith("my favorite song", { limit: 1 })
      expect(result.tracks).toHaveLength(1)
      expect(result.tracks[0].title).toBe("Found Song")
    })

    it("sin resultados → lanza error", async () => {
      mockSearch.mockResolvedValue([])

      await expect(resolveQuery("nonexistent query xyz123")).rejects.toThrow("Sin resultados")
    })

    it("búsqueda falla → propaga error", async () => {
      mockSearch.mockRejectedValue(new Error("search failed"))

      await expect(resolveQuery("test query")).rejects.toThrow()
    })
  })

  describe("sanitize URL", () => {
    it("URL con parámetros extra → limpia a watch?v=ID", async () => {
      mockSpawnYtDlp.mockResolvedValue({
        stdout: JSON.stringify({ title: "Clean Video", duration: 120, id: "xyz789" }),
        stderr: "",
        code: 0,
      })

      const result = await resolveQuery("https://youtube.com/watch?v=xyz789&t=120&feature=share")

      expect(result.tracks[0].url).toBe("https://www.youtube.com/watch?v=xyz789")
    })
  })
})

describe("autocompleteSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retorna videos formateados con emoji", async () => {
    mockSearch
      .mockResolvedValueOnce([makeVideo({ title: "Song A" }), makeVideo({ title: "Song B" })])
      .mockResolvedValueOnce([])

    const results = await autocompleteSearch("test query")

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toMatch(/^🎵 /)
  })

  it("clasifica albums por keywords", async () => {
    mockSearch
      .mockResolvedValueOnce([makeVideo()])
      .mockResolvedValueOnce([
        makePlaylist({ title: "My Album Full Album", videoCount: 12 }),
        makePlaylist({ title: "Best Playlist Ever", videoCount: 50 }),
      ])

    const results = await autocompleteSearch("artist name")

    const albumResults = results.filter((r: { name: string }) => r.name.startsWith("💿"))
    expect(albumResults.length).toBeGreaterThan(0)
    expect(albumResults[0].name).toContain("Album")
  })

  it("clasifica playlists por keywords", async () => {
    mockSearch
      .mockResolvedValueOnce([makeVideo()])
      .mockResolvedValueOnce([
        makePlaylist({ title: "Chill Vibes Mix", videoCount: 30 }),
      ])

    const results = await autocompleteSearch("chill")

    const playlistResults = results.filter((r: { name: string }) => r.name.startsWith("📋"))
    expect(playlistResults.length).toBeGreaterThan(0)
  })

  it("limita a 10 resultados máximo", async () => {
    const manyVideos = Array.from({ length: 20 }, (_, i) => makeVideo({ title: `Song ${i}` }))
    const manyPlaylists = Array.from({ length: 20 }, (_, i) => makePlaylist({ title: `Playlist ${i}` }))

    mockSearch
      .mockResolvedValueOnce(manyVideos)
      .mockResolvedValueOnce(manyPlaylists)

    const results = await autocompleteSearch("popular")

    expect(results.length).toBeLessThanOrEqual(10)
  })

  it("retorna array vacío si la búsqueda falla", async () => {
    mockSearch.mockRejectedValue(new Error("search failed"))

    const results = await autocompleteSearch("test")

    expect(results).toEqual([])
  })

  it("trunca nombres largos a 100 caracteres", async () => {
    const longTitle = "A".repeat(110)
    mockSearch
      .mockResolvedValueOnce([makeVideo({ title: longTitle })])
      .mockResolvedValueOnce([])

    const results = await autocompleteSearch("test")

    expect(results[0].name.length).toBeLessThanOrEqual(100)
    expect(results[0].name.endsWith("...")).toBe(true)
  })

  it("videos primero, luego albums, luego playlists", async () => {
    mockSearch
      .mockResolvedValueOnce([makeVideo({ title: "Video A" })])
      .mockResolvedValueOnce([makePlaylist({ title: "Album B", videoCount: 10 })])

    const results = await autocompleteSearch("test")

    const videoIdx = results.findIndex((r: { name: string }) => r.name.startsWith("🎵"))
    const albumIdx = results.findIndex((r: { name: string }) => r.name.startsWith("💿"))

    expect(videoIdx).toBeLessThan(albumIdx)
  })
})
