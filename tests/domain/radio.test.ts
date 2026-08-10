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
  voice: { join: async () => ok(undefined), destroy: () => {}, isConnected: () => true },
  player: { play: () => {}, stop: () => {}, pause: () => {}, unpause: () => {}, isPaused: () => false, onIdle: () => {}, onError: () => {}, getStatus: () => "idle" },
  notify: { sendQueueUpdate: async () => {}, editMessage: async () => {}, deleteMessage: async () => {} },
  cookieStore: { read: () => null, write: () => {}, validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }), delete: () => {}, filePath: () => null },
  browser: { init: async () => ok(undefined), close: async () => {}, refresh: async () => ({ success: true, timestamp: "" }), extract: async () => ({ success: true, timestamp: "" }), setupLogin: async () => ok({ url: "", instructions: "" }), isActive: () => false, resetProfile: async () => {} },
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
