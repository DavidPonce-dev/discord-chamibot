import { describe, it, expect } from "vitest"
import { createRadioEngine } from "@/domain/radio"
import type { Ports } from "@/domain/ports"
import type { LastFmSimilarTrack, VideoSearchResult } from "@/domain/types"

type EnginePorts = Parameters<typeof createRadioEngine>[0]

const video = (id: string, title: string, durationRaw = "4:00"): VideoSearchResult =>
  ({ id, title, url: `https://www.youtube.com/watch?v=${id}`, durationRaw })

const similar = (artist: string, name: string): LastFmSimilarTrack => ({ artist, name, match: 1, url: "" })

// Last.fm suggests `candidates` and YouTube answers every search with `videos`
const engineWith = (candidates: readonly LastFmSimilarTrack[], videos: readonly VideoSearchResult[]) => {
  const searched: string[] = []
  const ports: EnginePorts = {
    lastfm: {
      getSimilarTracks: async () => candidates,
      getSimilarArtists: async () => [],
      getArtistTopTracks: async () => [],
      searchTrack: async () => [],
      getTrackTopTags: async () => [],
    },
    groq: { recommend: async () => [], parseTitle: async () => null },
    search: {
      resolveQuery: async () => ({ ok: false as const, error: "unused" }),
      autocomplete: async () => [],
      searchVideos: async (query: string) => { searched.push(query); return videos },
    } as Ports["search"],
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, event: () => {} },
  }
  return { engine: createRadioEngine(ports), searched }
}

describe("domain/radio - choosing the YouTube video", () => {
  it("prefers the studio version over live, cover or karaoke uploads", async () => {
    const { engine } = engineWith([similar("Air", "Venus")], [
      video("live", "Air - Venus (Live at Canal+)"),
      video("cover", "Venus - Air (Cover by Someone)"),
      video("karaoke", "Air - Venus [Karaoke Version]"),
      video("studio", "Air - Venus"),
    ])
    const result = await engine.findRelated("Air - Sexy Boy", [])
    expect(result?.track.id).toBe("studio")
  })

  it("accepts a live upload when the recommended track is the live one", async () => {
    const { engine } = engineWith([similar("Nirvana", "About a Girl (Live)")], [
      video("live", "Nirvana - About A Girl (Live On MTV Unplugged)"),
      video("studio", "Nirvana - About A Girl"),
    ])
    const result = await engine.findRelated("Nirvana - Come As You Are", [])
    expect(result?.track.id).toBe("live")
  })

  it("still plays an alternate version when it is the only result", async () => {
    const { engine } = engineWith([similar("Air", "Venus")], [video("live", "Air - Venus (Live)")])
    const result = await engine.findRelated("Air - Sexy Boy", [])
    expect(result?.track.id).toBe("live")
  })

  it("skips clips that are too short and results without a duration", async () => {
    const { engine } = engineWith([similar("Air", "Venus")], [
      video("short", "Air - Venus #shorts", "0:20"),
      { id: "unknown", title: "Air - Venus", url: "https://www.youtube.com/watch?v=unknown" },
      video("full", "Air - Venus (Audio)", "4:04"),
    ])
    const result = await engine.findRelated("Air - Sexy Boy", [])
    expect(result?.track.id).toBe("full")
  })
})

describe("domain/radio - recently played", () => {
  const history = ["the weeknd - blinding lights (official video)"]

  // "blinding lights" contains "blind": a substring match discarded unrelated songs
  it("does not discard a song whose name is only part of a word in a recent title", async () => {
    const { engine, searched } = engineWith([similar("Mika", "Blind")], [video("ok", "Mika - Blind")])
    const result = await engine.findRelated("The Weeknd - Save Your Tears", history)
    expect(searched).toContain("Mika Blind")
    expect(result?.track.id).toBe("ok")
  })

  it("discards a song that was just played, whatever the punctuation or case", async () => {
    const { engine, searched } = engineWith([similar("The Weeknd", "Blinding Lights")], [video("again", "The Weeknd - Blinding Lights")])
    await engine.findRelated("The Weeknd - Save Your Tears", history)
    expect(searched).not.toContain("The Weeknd Blinding Lights")
  })
})
