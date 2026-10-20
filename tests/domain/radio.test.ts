import { describe, it, expect, vi } from "vitest"
import { createRadioEngine, recommendAndEnqueue } from "@/domain/radio"
import type { Ports } from "@/domain/ports"
import { createSession } from "@/domain/session"
import { ok } from "@/shared/result"

const createMockPorts = (overrides: Partial<Ports> = {}): Ports => ({
  audio: {
    createResource: async () => ok({} as any),
    getAudioUrl: async () => ok("https://audio.example/stream"),
    createFromAudioUrl: async () => ok({} as any),
    killProcess: () => {},
    consumeStreamFailure: () => false,
  },
  search: {
    resolveQuery: async () => ok({ tracks: [] }),
    autocomplete: async () => [],
    searchVideos: async () => [],
  },
  recommend: { findRelated: async () => null },
  lastfm: {
    getSimilarTracks: async () => [],
    getSimilarArtists: async () => [],
    getArtistTopTracks: async () => [],
    searchTrack: async () => [],
    getTrackTopTags: async () => [],
  },
  groq: {
    recommend: async () => [],
    parseTitle: async () => null,
  },
  voice: { join: async () => ok(undefined), destroy: () => {} },
  player: { play: () => {}, stop: () => {}, pause: () => {}, unpause: () => {}, onIdle: () => {}, onError: () => {} },
  notify: { sendQueueUpdate: async () => {}, editMessage: async () => {}, deleteMessage: async () => {} },
  cookieStore: { read: () => null, validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }), delete: () => {}, filePath: () => null },
  browser: { close: async () => {}, refresh: async () => ({ success: true, timestamp: "" }), extract: async () => ({ success: true, timestamp: "" }), setupLogin: async () => ok({ url: "", instructions: "" }), isActive: () => false, resetProfile: async () => {} },
  blacklist: { getAll: () => [], add: () => {}, remove: () => false, isBlacklisted: () => false },
  guilds: { list: () => [], leave: async () => ok(undefined), voiceChannelName: () => null },
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, event: () => {} },
  ...overrides,
})

describe("domain/radio - RadioEngine", () => {
  it("returns null for empty title", async () => {
    const engine = createRadioEngine(createMockPorts())
    const result = await engine.findRelated("", [])
    expect(result).toBeNull()
  })

  it("returns Last.fm recommendation when available", async () => {
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [
          { name: "Similar Song", artist: "Similar Artist", match: 0.9, url: "https://last.fm/track" },
        ],
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "Similar Artist - Similar Song", url: "https://youtube.com/watch?v=abc", id: "abc", durationRaw: "3:00" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [])
    expect(result).not.toBeNull()
    expect(result!.track.url).toContain("youtube.com")
  })

  it("falls back to Groq when Last.fm returns nothing", async () => {
    const ports = createMockPorts({
      groq: {
        recommend: async () => [{ name: "Groq Pick", artist: "Groq Artist" }],
        parseTitle: async () => null,
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "Groq Artist - Groq Pick", url: "https://youtube.com/watch?v=xyz", id: "xyz", durationRaw: "4:00" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [])
    expect(result).not.toBeNull()
  })

  it("uses Groq parseTitle when artist cannot be extracted", async () => {
    const parseTitle = vi.fn().mockResolvedValue({ artist: "Parsed Artist", song: "Parsed Song" })
    const ports = createMockPorts({
      groq: {
        recommend: async () => [{ name: "Rec", artist: "RecArtist" }],
        parseTitle,
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "RecArtist - Rec", url: "https://youtube.com/watch?v=rec", id: "rec", durationRaw: "3:30" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    await engine.findRelated("Some Unparseable YouTube Title [Official Video]", [])
    expect(parseTitle).toHaveBeenCalled()
  })

  it("triggers artist switch when shouldSwitch is true", async () => {
    const getSimilarArtists = vi.fn().mockResolvedValue([
      { name: "Similar Band", match: 0.8, url: "" },
    ])
    const getArtistTopTracks = vi.fn().mockResolvedValue([
      { name: "Top Song", artist: "Similar Band", match: 1, url: "" },
    ])
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [],
        getSimilarArtists,
        getArtistTopTracks,
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "Similar Band - Top Song", url: "https://youtube.com/watch?v=switch", id: "switch", durationRaw: "3:00" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [], {
      shouldSwitch: true,
      currentArtist: "Artist",
    })
    expect(getSimilarArtists).toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it("excludes previously played tracks", async () => {
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [
          { name: "Already Played", artist: "Artist", match: 1, url: "" },
        ],
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      groq: { recommend: async () => [], parseTitle: async () => null },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Already Played", ["artist - already played"])
    expect(result).toBeNull()
  })

  it("filters out videos exceeding max duration", async () => {
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [
          { name: "Long Song", artist: "Artist", match: 1, url: "" },
        ],
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "Long Song", url: "https://youtube.com/watch?v=long", id: "long", durationRaw: "1:00:00" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [])
    expect(result).toBeNull()
  })

  it("excludes already-played videos via excludeIds", async () => {
    const ports = createMockPorts({
      groq: {
        recommend: async () => [{ name: "Pick", artist: "Artist" }],
        parseTitle: async () => null,
      },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async () => [
          { title: "Artist - Already Played", url: "https://youtube.com/watch?v=played1", id: "played1", durationRaw: "3:00" },
          { title: "Artist - Pick", url: "https://youtube.com/watch?v=pick1", id: "pick1", durationRaw: "3:00" },
        ],
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [], { excludeIds: ["played1"] })
    expect(result).not.toBeNull()
    expect(result!.track.id).toBe("pick1")
  })

  it("recommendAndEnqueue builds excludeIds from current track and last5Ids", async () => {
    const findRelated = vi.fn().mockResolvedValue({
      track: { title: "Next", url: "https://youtube.com/watch?v=next", id: "next" },
      canonicalTitle: "Artist - Next",
    })
    const ports = createMockPorts({ recommend: { findRelated } })
    const base = createSession("g1", "v1")
    const session = {
      ...base,
      last5Ids: ["played1", "played2"],
      queue: { ...base.queue, current: { title: "Current", url: "u", requestedBy: "u", id: "cur1" } },
    }

    await recommendAndEnqueue(session, ports.recommend, ports.logger)

    expect(findRelated).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ excludeIds: ["cur1", "played1", "played2"] }),
    )
  })

  it("does not search Groq candidates on YouTube when Last.fm succeeds", async () => {
    const searchVideos = vi.fn(async (query: string) => [
      { title: query, url: `https://youtube.com/watch?v=${encodeURIComponent(query)}`, id: query, durationRaw: "3:00" },
    ])
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [{ name: "LF Song", artist: "LF Artist", match: 1, url: "" }],
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      groq: { recommend: async () => [{ name: "Groq Song", artist: "Groq Artist" }], parseTitle: async () => null },
      search: { resolveQuery: async () => ok({ tracks: [] }), autocomplete: async () => [], searchVideos },
    })
    const result = await createRadioEngine(ports).findRelated("Artist - Song", [])
    expect(result?.canonicalTitle).toBe("LF Artist - LF Song")
    expect(searchVideos).toHaveBeenCalledTimes(1)
    expect(searchVideos).not.toHaveBeenCalledWith(expect.stringContaining("Groq"), expect.anything())
  })

  it("searches candidates in parallel and keeps priority order", async () => {
    let active = 0
    let maxActive = 0
    const searchVideos = vi.fn(async (query: string) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, query.includes("First") ? 20 : 5))
      active--
      return [{ title: query, url: `https://youtube.com/watch?v=${query.length}`, id: query, durationRaw: "3:00" }]
    })
    const ports = createMockPorts({
      groq: {
        recommend: async () => [
          { name: "First", artist: "A" },
          { name: "Second", artist: "B" },
          { name: "Third", artist: "C" },
        ],
        parseTitle: async () => null,
      },
      search: { resolveQuery: async () => ok({ tracks: [] }), autocomplete: async () => [], searchVideos },
    })
    const result = await createRadioEngine(ports).findRelated("Artist - Song", [])
    expect(maxActive).toBe(3)
    // "First" is slowest but highest priority, so it still wins
    expect(result?.canonicalTitle).toBe("A - First")
  })

  it("skips recently played candidates before picking, so they don't use up the attempts", async () => {
    // 3 played songs ranked first + 1 unplayed: picking before filtering could leave nothing
    const searchVideos = vi.fn(async (query: string) => [
      { title: query, url: `https://youtube.com/watch?v=${query.length}`, id: query, durationRaw: "3:00" },
    ])
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [
          { name: "Played One", artist: "X", match: 1, url: "" },
          { name: "Played Two", artist: "X", match: 0.99, url: "" },
          { name: "Played Three", artist: "X", match: 0.98, url: "" },
          { name: "Fresh", artist: "Y", match: 0.5, url: "" },
        ],
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      search: { resolveQuery: async () => ok({ tracks: [] }), autocomplete: async () => [], searchVideos },
    })
    const engine = createRadioEngine(ports)
    for (let i = 0; i < 10; i++) {
      const result = await engine.findRelated("Artist - Song", ["x - played one", "x - played two", "x - played three"])
      expect(result?.canonicalTitle).toBe("Y - Fresh")
    }
  })

  it("tries Last.fm similar artists before Groq when there are no similar tracks", async () => {
    const groqRecommend = vi.fn(async () => [{ name: "LLM Pick", artist: "Random Artist" }])
    const getSimilarArtists = vi.fn(async () => [{ name: "Justice", match: 0.9, url: "" }])
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks: async () => [],
        getSimilarArtists,
        getArtistTopTracks: async () => [{ name: "Genesis", artist: "Justice", match: 1, url: "" }],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
      groq: { recommend: groqRecommend, parseTitle: async () => null },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async (query: string) => [
          { title: query, url: `https://youtube.com/watch?v=${query.length}`, id: query, durationRaw: "3:00" },
        ],
      },
    })
    const result = await createRadioEngine(ports).findRelated("Daft Punk - Obscure B-Side (Official Audio)", [])
    expect(getSimilarArtists).toHaveBeenCalledWith("Daft Punk", 5)
    expect(result?.canonicalTitle).toBe("Justice - Genesis")
  })

  it("sends clean artist/song names to Last.fm", async () => {
    const getSimilarTracks = vi.fn(async () => [])
    const ports = createMockPorts({
      lastfm: {
        getSimilarTracks,
        getSimilarArtists: async () => [],
        getArtistTopTracks: async () => [],
        searchTrack: async () => [],
        getTrackTopTags: async () => [],
      },
    })
    await createRadioEngine(ports).findRelated("Bad Bunny - Tití Me Preguntó (Official Video) | Un Verano Sin Ti", [])
    expect(getSimilarTracks).toHaveBeenCalledWith("Bad Bunny", "Tití Me Preguntó", 15)
  })

  it("falls back to broad YouTube search", async () => {
    const ports = createMockPorts({
      groq: { recommend: async () => [], parseTitle: async () => ({ artist: "Artist", song: "Song" }) },
      search: {
        resolveQuery: async () => ok({ tracks: [] }),
        autocomplete: async () => [],
        searchVideos: async (query: string) => {
          if (query === "Artist songs") {
            return [{ title: "Artist - Hit", url: "https://youtube.com/watch?v=broad", id: "broad", durationRaw: "3:00" }]
          }
          return []
        },
      },
    })
    const engine = createRadioEngine(ports)
    const result = await engine.findRelated("Artist - Song", [])
    expect(result).not.toBeNull()
  })
})
