import { describe, it, expect, vi, beforeEach } from "vitest"
import { YouTubeRecommender, isMusic, normalizeTitle } from "../src/radio/YouTubeRecommender"
import type { Track } from "../src/core/types"

const mockSearchPlayDl = vi.hoisted(() => vi.fn())
const mockPlayVideoInfo = vi.hoisted(() => vi.fn())

vi.mock("play-dl", () => ({
  default: {
    video_basic_info: mockPlayVideoInfo,
  },
}))

vi.mock("../src/radio/RadioSearchService", () => ({
  searchPlayDl: mockSearchPlayDl,
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

describe("YouTubeRecommender", () => {
  let service: YouTubeRecommender

  beforeEach(() => {
    service = new YouTubeRecommender()
    vi.resetAllMocks()
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
    })

    it("play-dl encuentra resultados → devuelve track", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Another Song", "4:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("xyz789")
      expect(result!.title).toBe("Artist Name - Another Song")
    })

    it("play-dl devuelve vacío → null", async () => {
      mockSearchPlayDl.mockResolvedValue([])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).toBeNull()
    })

    it("play-dl falla → null", async () => {
      mockSearchPlayDl.mockResolvedValue([])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).toBeNull()
    })
  })

  describe("findRelated — filtrado", () => {
    it("filtra track que coincide con current ID", async () => {
      mockSearchPlayDl.mockResolvedValue([
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
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Song Title", "3:30"),
      ])

      const result = await service.findRelated(
        makeTrack({ title: "Artist Name - Song Title" }),
        "Artist Name - Song Title",
      )
      expect(result).toBeNull()
    })

    it("filtra tracks de más de 1500s", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("long1", "Very Long Song", "30:00"),
        makePlayResult("short1", "Short Song", "3:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("short1")
    })

    it("todos filtrados → null", async () => {
      mockSearchPlayDl.mockResolvedValue([
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
      mockSearchPlayDl.mockResolvedValueOnce([
        makePlayResult("genre1", "Rock Song", "3:00"),
      ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(mockSearchPlayDl).toHaveBeenCalledWith("rock music")
    })

    it("genre query da vacío → fallback a artist query", async () => {
      mockPlayVideoInfo.mockResolvedValue({
        video_details: { tags: ["rock"] },
      })
      mockSearchPlayDl
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makePlayResult("artist1", "Artist Name - Another Song", "3:00"),
        ])

      const result = await service.findRelated(makeTrack(), "Artist Name - Song Title")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("artist1")
      expect(mockSearchPlayDl).toHaveBeenCalledTimes(2)
    })
  })

  describe("isMusic", () => {
    it("true cuando category es Music", async () => {
      mockPlayVideoInfo.mockResolvedValue({
        video_details: { category: "Music" },
      })

      const result = await isMusic({
        title: "Some Song",
        url: "https://youtube.com/watch?v=test123",
      })
      expect(result).toBe(true)
    })

    it("false cuando category no es Music", async () => {
      mockPlayVideoInfo.mockResolvedValue({
        video_details: { category: "Gaming" },
      })

      const result = await isMusic({
        title: "Some Song",
        url: "https://youtube.com/watch?v=test123",
      })
      expect(result).toBe(false)
    })

    it("false cuando title contiene keyword no musical", async () => {
      const result = await isMusic({
        title: "Interview with Artist - Deep Talk",
        url: "https://youtube.com/watch?v=test123",
      })
      expect(result).toBe(false)
    })

    it("true cuando API falla y no hay red flags", async () => {
      mockPlayVideoInfo.mockRejectedValue(new Error("network error"))

      const result = await isMusic({
        title: "Some Song",
        url: "https://youtube.com/watch?v=test123",
      })
      expect(result).toBe(true)
    })

    it("true cuando no hay URL (inclusive fallback)", async () => {
      const result = await isMusic({
        title: "Unknown Track",
      })
      expect(result).toBe(true)
    })
  })

  describe("normalizeTitle", () => {
    it("elimina parentesis y brackets", () => {
      expect(normalizeTitle("Song Title (Official Video) [4K]")).toBe("song title")
    })

    it("preserva estructura Artista - Tema", () => {
      expect(normalizeTitle("Queen - Bohemian Rhapsody (Official Video)")).toBe("queen - bohemian rhapsody")
    })

    it("normaliza mayusculas y espacios", () => {
      expect(normalizeTitle("  ARTIST  -  SONG  ")).toBe("artist - song")
    })

    it("elimina sufijos comunes", () => {
      expect(normalizeTitle("Bohemian Rhapsody (Lyric Video)")).toBe("bohemian rhapsody")
      expect(normalizeTitle("Bohemian Rhapsody (Official Audio)")).toBe("bohemian rhapsody")
      expect(normalizeTitle("Bohemian Rhapsody (Live at Wembley)")).toBe("bohemian rhapsody")
    })

    it("diferencia covers de versiones originales", () => {
      expect(normalizeTitle("Queen - Bohemian Rhapsody")).toBe("queen - bohemian rhapsody")
      expect(normalizeTitle("Panic! At The Disco - Bohemian Rhapsody")).toBe("panic! at the disco - bohemian rhapsody")
    })
  })

  describe("findRelated — exclusion por historial", () => {
    beforeEach(() => {
      mockPlayVideoInfo.mockRejectedValue(new Error("no info"))
    })

    it("excluye candidatos que matchean el historial normalizado", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("official", "Artist Name - Song Title (Official Video)", "3:30"),
        makePlayResult("audio", "Artist Name - Song Title (Audio)", "3:30"),
      ])

      const exclude = new Set(["artist name - song title"])
      const result = await service.findRelated(
        makeTrack({ id: "prev123" }),
        "Artist Name - Song Title",
        exclude,
      )
      expect(result).toBeNull()
    })

    it("no excluye tracks con distinto artista/tema", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("diff1", "Different Artist - Another Song", "3:30"),
      ])

      const exclude = new Set(["artist name - song title"])
      const result = await service.findRelated(
        makeTrack({ id: "prev123" }),
        "Artist Name - Song Title",
        exclude,
      )
      expect(result).not.toBeNull()
      expect(result!.id).toBe("diff1")
    })
  })
})
