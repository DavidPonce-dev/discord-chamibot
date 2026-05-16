import { describe, it, expect, vi, beforeEach } from "vitest"
import { AutoplayService } from "../src/services/AutoplayService"
import type { Track } from "../src/core/types"

const mockPlaySearch = vi.hoisted(() => vi.fn())
const mockPlayVideoInfo = vi.hoisted(() => vi.fn())
const mockYoutubedl = vi.hoisted(() => vi.fn())

vi.mock("play-dl", () => ({
  default: {
    search: mockPlaySearch,
    video_basic_info: mockPlayVideoInfo,
  },
}))

vi.mock("youtube-dl-exec", () => ({
  default: mockYoutubedl,
}))

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Artist Name - Song Title",
    url: "https://youtube.com/watch?v=abc123",
    requestedBy: "tester",
    duration: "3:30",
    id: "abc123",
    thumbnail: "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    ...overrides,
  }
}

function makePlayResult(id: string, title: string, durationRaw: string) {
  return { id, title, url: `https://youtube.com/watch?v=${id}`, durationRaw }
}

describe("AutoplayService", () => {
  let service: AutoplayService

  beforeEach(() => {
    service = new AutoplayService()
    vi.clearAllMocks()
  })

  describe("findRelated — errores esperados (inputs inválidos)", () => {
    it("null, null devuelve null", async () => {
      const result = await service.findRelated(null, null)
      expect(result).toBeNull()
    })

    it("track sin url y sin title devuelve null", async () => {
      const track = makeTrack({ url: "", title: "" })
      const result = await service.findRelated(track, null)
      expect(result).toBeNull()
    })
  })

  describe("findRelated — sin género (solo búsqueda por artista)", () => {
    beforeEach(() => {
      mockPlayVideoInfo.mockRejectedValue(new Error("no info"))
      mockPlaySearch.mockReset()
      mockYoutubedl.mockReset()
    })

    it("play-dl encuentra resultados → devuelve track", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Another Song", "4:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("xyz789")
      expect(result!.title).toBe("Artist Name - Another Song")
    })

    it("play-dl encuentra resultados → NO llama a yt-dlp", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Another Song", "4:00"),
      ])

      await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(mockYoutubedl).not.toHaveBeenCalled()
    })

    it("play-dl devuelve vacío → fallback a yt-dlp", async () => {
      mockPlaySearch.mockResolvedValue([])
      mockYoutubedl.mockResolvedValue({
        entries: [
          { id: "yt777", title: "YT Fallback Song", duration: 250 },
        ],
      })

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("yt777")
      expect(mockYoutubedl).toHaveBeenCalledOnce()
    })

    it("play-dl falla → fallback a yt-dlp", async () => {
      mockPlaySearch.mockRejectedValue(new Error("network error"))
      mockYoutubedl.mockResolvedValue({
        entries: [
          { id: "yt777", title: "YT Fallback", duration: 200 },
        ],
      })

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("yt777")
    })

    it("play-dl y yt-dlp fallan → null", async () => {
      mockPlaySearch.mockRejectedValue(new Error("network error"))
      mockYoutubedl.mockRejectedValue(new Error("yt-dlp error"))

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).toBeNull()
    })
  })

  describe("findRelated — filtrado", () => {
    it("filtra track que coincide con current ID", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("abc123", "Artist Name - Song Title", "3:30"),
        makePlayResult("xyz789", "Different Song", "4:00"),
      ])

      const result = await service.findRelated(
        makeTrack({ id: "abc123" }),
        "Artist Name - Song Title",
      )
      expect(result).not.toBeNull()
      expect(result!.id).toBe("xyz789")
    })

    it("filtra track que coincide con current title", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Song Title", "3:30"),
      ])

      const result = await service.findRelated(
        makeTrack({ title: "Artist Name - Song Title" }),
        "Artist Name - Song Title",
      )
      expect(result).toBeNull()
    })

    it("filtra tracks de más de 1500s", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("long1", "Very Long Song", "30:00"),
        makePlayResult("short1", "Short Song", "3:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("short1")
    })

    it("todos filtrados → null", async () => {
      mockPlaySearch.mockResolvedValue([
        makePlayResult("abc123", "Artist Name - Song Title", "3:30"),
      ])

      const result = await service.findRelated(
        makeTrack({ id: "abc123" }),
        "Artist Name - Song Title",
      )
      expect(result).toBeNull()
    })
  })

  describe("findRelated — género musical", () => {
    it("detecta género y lo usa como query prioritaria", async () => {
      mockPlayVideoInfo.mockResolvedValue({
        video_details: { tags: ["rock", "guitar", "live"] },
      })
      mockPlaySearch.mockResolvedValueOnce([
        makePlayResult("genre1", "Rock Song", "3:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(mockPlaySearch).toHaveBeenCalledWith("rock music", { limit: 15 })
    })

    it("genre query da vacío → fallback a artist query", async () => {
      mockPlayVideoInfo.mockResolvedValue({
        video_details: { tags: ["rock"] },
      })
      mockPlaySearch
        .mockResolvedValueOnce([])    // genre query → vacío
        .mockResolvedValueOnce([      // artist query → resultados
          makePlayResult("artist1", "Artist Name - Another Song", "3:00"),
        ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("artist1")
      expect(mockPlaySearch).toHaveBeenCalledTimes(2)
    })
  })
})
