import type { Ports } from "@/domain/ports"
import type {
  AudioResourceHandle, ResolveResult, RadioResult, CookieValidation,
  CookieRefreshResult, BlacklistEntry, GuildInfo, AutocompleteChoice,
  VideoSearchResult, GroqCandidate, ParsedTrack, LastFmSimilarTrack,
  LastFmSimilarArtist, LastFmSearchResult, LastFmTag,
} from "@/domain/types"
import { ok, type Result } from "@/shared/result"
import { vi } from "vitest"

export const createMockPorts = (overrides: Partial<Ports> = {}): Ports => ({
  audio: {
    createResource: async (): Promise<Result<AudioResourceHandle, string>> => ok({} as AudioResourceHandle),
    getAudioUrl: async (): Promise<Result<string, string>> => ok("https://audio.example/stream"),
    createFromAudioUrl: async (): Promise<Result<AudioResourceHandle, string>> => ok({} as AudioResourceHandle),
    killProcess: () => {},
  },
  search: {
    resolveQuery: async (): Promise<Result<ResolveResult, string>> => ok({
      tracks: [{ url: "https://youtube.com/watch?v=test", title: "Test Track", duration: "3:00", id: "test123" }],
    }),
    autocomplete: async (): Promise<readonly AutocompleteChoice[]> => [],
    searchVideos: async (): Promise<readonly VideoSearchResult[]> => [],
  },
  recommend: {
    findRelated: async (): Promise<RadioResult | null> => null,
  },
  lastfm: {
    getSimilarTracks: async (): Promise<readonly LastFmSimilarTrack[]> => [],
    getSimilarArtists: async (): Promise<readonly LastFmSimilarArtist[]> => [],
    getArtistTopTracks: async (): Promise<readonly LastFmSimilarTrack[]> => [],
    searchTrack: async (): Promise<readonly LastFmSearchResult[]> => [],
    getTrackTopTags: async (): Promise<readonly LastFmTag[]> => [],
  },
  groq: {
    recommend: async (): Promise<readonly GroqCandidate[]> => [],
    parseTitle: async (): Promise<ParsedTrack | null> => null,
  },
  voice: {
    join: async (): Promise<Result<void, string>> => ok(undefined),
    destroy: () => {},
    isConnected: (): boolean => true,
  },
  player: {
    play: () => {},
    stop: () => {},
    pause: () => {},
    unpause: () => {},
    isPaused: (): boolean => false,
    onIdle: vi.fn(),
    onError: () => {},
    getStatus: (): string => "idle",
    subscribeToConnection: () => {},
  },
  notify: {
    sendQueueUpdate: async () => {},
    editMessage: async () => {},
    deleteMessage: async () => {},
  },
  cookieStore: {
    read: (): string | null => null,
    write: () => {},
    validate: (): CookieValidation => ({
      isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null,
    }),
    delete: () => {},
    filePath: (): string | null => null,
  },
  browser: {
    init: async (): Promise<Result<void, string>> => ok(undefined),
    close: async () => {},
    refresh: async (): Promise<CookieRefreshResult> => ({ success: true, timestamp: new Date().toISOString() }),
    extract: async (): Promise<CookieRefreshResult> => ({ success: true, timestamp: new Date().toISOString() }),
    setupLogin: async (): Promise<Result<{ url: string; instructions: string }, string>> => ok({ url: "", instructions: "" }),
    isActive: (): boolean => false,
    resetProfile: async () => {},
  },
  blacklist: {
    getAll: (): readonly BlacklistEntry[] => [],
    add: () => {},
    remove: (): boolean => false,
    isBlacklisted: (): boolean => false,
  },
  guilds: {
    list: (): readonly GuildInfo[] => [],
    leave: async (): Promise<Result<void, string>> => ok(undefined),
    voiceChannelName: (): string | null => null,
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    event: () => {},
  },
  ...overrides,
})
