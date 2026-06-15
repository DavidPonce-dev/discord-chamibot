import { describe, it, expect, vi, beforeEach } from "vitest"
import { findRelated, extractArtist, extractSongOnly } from "@/radio/LastFmRecommender"

const mockSearchPlayDl = vi.hoisted(() => vi.fn())
const mockGetSimilarTracks = vi.hoisted(() => vi.fn())
const mockSearchTrack = vi.hoisted(() => vi.fn())
const mockGetTrackTopTags = vi.hoisted(() => vi.fn(async () => []))
const mockParseTrackTitle = vi.hoisted(() => vi.fn(async () => null))
const mockGroqRecommend = vi.hoisted(() =>
  vi.fn(async () => [{ artist: "Default Artist", name: "Default Song" }]),
)

vi.mock("@/radio/RadioSearchService", () => ({
  searchPlayDl: mockSearchPlayDl,
}))

vi.mock("@/services/lastfm/LastFmService", () => ({
  getSimilarTracks: mockGetSimilarTracks,
  getSimilarArtists: vi.fn(),
  getArtistTopTracks: vi.fn(),
  searchTrack: mockSearchTrack,
  getTrackTopTags: mockGetTrackTopTags,
}))

vi.mock("@/services/llm/TrackParser", () => ({
  parseTrackTitle: mockParseTrackTitle,
}))

vi.mock("@/services/llm/RadioRecommender", () => ({
  groqRecommend: mockGroqRecommend,
}))

function makePlayResult(id: string, title: string, durationRaw: string) {
  return { id, title, url: `https://youtube.com/watch?v=${id}`, durationRaw }
}

describe("findRelated", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe("errores esperados (inputs inválidos)", () => {
    it("titulo vacío devuelve null", async () => {
      const result = await findRelated("", [])
      expect(result).toBeNull()
    })
  })

  describe("con artista detectable", () => {
    it("Last.fm encuentra similar track → resuelve a YouTube", async () => {
      mockGetSimilarTracks.mockResolvedValue([
        { name: "Another Song", artist: "Artist Name", match: 0.8, url: "" },
      ])
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("xyz789", "Artist Name - Another Song", "4:00"),
      ])

      const result = await findRelated("Artist Name - Song Title", [])
      expect(result).not.toBeNull()
      expect(result!.track.id).toBe("xyz789")
    })

    it("Last.fm devuelve vacío → fallback a Groq", async () => {
      mockGetSimilarTracks.mockResolvedValue([])
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("fallback1", "Artist Name music mix", "3:00"),
      ])

      const result = await findRelated("Artist Name - Song Title", [])
      expect(result).not.toBeNull()
    })
  })

  describe("sin artista detectable (solo canción)", () => {
    it("descubre artista via searchTrack → encuentra similar", async () => {
      mockSearchTrack.mockResolvedValue([
        { name: "Song Title", artist: "Discovered Artist", listeners: 1000, url: "" },
      ])
      mockGetSimilarTracks.mockResolvedValue([
        { name: "Similar Song", artist: "Discovered Artist", match: 0.9, url: "" },
      ])
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("disco1", "Discovered Artist - Similar Song", "3:30"),
      ])

      const result = await findRelated("Song Title (Official Video)", [])
      expect(result).not.toBeNull()
      expect(mockSearchTrack).toHaveBeenCalledWith("Song Title", 5)
    })

    it("searchTrack sin resultados → fallback a Groq", async () => {
      mockSearchTrack.mockResolvedValue([])
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("fallback2", "Song Title remix", "3:00"),
      ])

      const result = await findRelated("Song Title", [])
      expect(result).not.toBeNull()
    })
  })

  describe("filtrado", () => {
    beforeEach(() => {
      mockGetSimilarTracks.mockResolvedValue([])
      mockSearchTrack.mockResolvedValue([])
    })

    it("filtra track que coincide con current ID", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("abc123", "Artist Name - Song Title", "3:30"),
        makePlayResult("xyz789", "Different Song", "4:00"),
      ])

      const history = ["https://youtube.com/watch?v=abc123"]
      const result = await findRelated("Artist Name - Song Title", history)
      expect(result).not.toBeNull()
      expect(result!.track.id).toBe("xyz789")
    })

    it("filtra tracks de más de 1500s", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("long1", "Very Long Song", "30:00"),
        makePlayResult("short1", "Short Song", "3:00"),
      ])

      const result = await findRelated("Artist Name - Song Title", [])
      expect(result).not.toBeNull()
      expect(result!.track.id).toBe("short1")
    })
  })

  describe("exclusion por historial", () => {
    beforeEach(() => {
      mockGetSimilarTracks.mockResolvedValue([])
      mockSearchTrack.mockResolvedValue([])
    })

    it("no excluye tracks con distinto artista/tema", async () => {
      mockSearchPlayDl.mockResolvedValue([
        makePlayResult("diff1", "Different Artist - Another Song", "3:30"),
      ])

      const history = ["https://youtube.com/watch?v=prev123"]
      const result = await findRelated("Artist Name - Song Title", history)
      expect(result).not.toBeNull()
      expect(result!.track.id).toBe("diff1")
    })
  })
})

describe("extractArtist", () => {
  it("extrae artista con guion normal", () => {
    expect(extractArtist("Queen - Bohemian Rhapsody")).toBe("Queen")
  })

  it("extrae artista con em dash", () => {
    expect(extractArtist("Queen — Bohemian Rhapsody")).toBe("Queen")
  })

  it("extrae artista con doble slash", () => {
    expect(extractArtist("Queen // Bohemian Rhapsody")).toBe("Queen")
  })

  it("extrae artista con colon", () => {
    expect(extractArtist("Queen: Bohemian Rhapsody")).toBe("Queen")
  })

  it("extrae artista con ft.", () => {
    expect(extractArtist("Queen ft. David Bowie - Under Pressure")).toBe("Queen")
  })

  it("extrae artista con feat.", () => {
    expect(extractArtist("Queen feat. David Bowie - Under Pressure")).toBe("Queen")
  })

  it("devuelve vacío cuando no hay separador", () => {
    expect(extractArtist("Bohemian Rhapsody")).toBe("")
  })

  it("ignora paréntesis y brackets", () => {
    expect(extractArtist("Bohemian Rhapsody (Official Video)")).toBe("")
  })

  it("extrae artista con brackets japoneses「」", () => {
    expect(extractArtist("The GazettE「FILTH IN THE BEAUTY」HDフル")).toBe("The GazettE")
  })

  it("extrae artista con brackets japoneses y sin separador", () => {
    expect(extractArtist("Ado「唱」")).toBe("Ado")
  })
})

describe("extractSongOnly", () => {
  it("extrae canción de formato 'Artist - Song'", () => {
    expect(extractSongOnly("Queen - Bohemian Rhapsody")).toBe("Bohemian Rhapsody")
  })

  it("extrae canción con em dash", () => {
    expect(extractSongOnly("Queen — Bohemian Rhapsody")).toBe("Bohemian Rhapsody")
  })

  it("extrae canción con doble slash", () => {
    expect(extractSongOnly("Queen // Bohemian Rhapsody")).toBe("Bohemian Rhapsody")
  })

  it("extrae canción con ft.", () => {
    expect(extractSongOnly("Queen ft. David Bowie - Under Pressure")).toBe("Under Pressure")
  })

  it("devuelve título limpio sin separador", () => {
    expect(extractSongOnly("Bohemian Rhapsody (Official Video)")).toBe("Bohemian Rhapsody")
  })

  it("extrae canción con brackets japoneses「」", () => {
    expect(extractSongOnly("The GazettE「FILTH IN THE BEAUTY」HDフル")).toBe("FILTH IN THE BEAUTY")
  })

  it("extrae canción con brackets japoneses sin separador", () => {
    expect(extractSongOnly("Ado「唱」")).toBe("唱")
  })
})
