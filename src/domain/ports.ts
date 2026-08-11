import type { AudioResourceHandle } from "./types"
import type {
  ResolveResult, RadioResult, CookieValidation,
  CookieRefreshResult, BlacklistEntry, GuildInfo, AutocompleteChoice,
  VideoSearchResult, RecommendOpts, QueuePayload, GroqCandidate,
  ParsedTrack, LastFmSimilarTrack, LastFmSimilarArtist, LastFmSearchResult, LastFmTag,
} from "./types"
import type { Result } from "../shared/result"

export type AudioStreamPort = Readonly<{
  createResource: (guildId: string, url: string, seek?: number) => Promise<Result<AudioResourceHandle, string>>
  getAudioUrl: (url: string) => Promise<Result<string, string>>
  createFromAudioUrl: (guildId: string, audioUrl: string, seek?: number) => Promise<Result<AudioResourceHandle, string>>
  killProcess: (guildId: string) => void
  consumeStreamFailure: (guildId: string) => boolean
}>

export type TrackSearchPort = Readonly<{
  resolveQuery: (query: string) => Promise<Result<ResolveResult, string>>
  autocomplete: (query: string) => Promise<readonly AutocompleteChoice[]>
  searchVideos: (query: string, limit?: number) => Promise<readonly VideoSearchResult[]>
}>

export type LastFmPort = Readonly<{
  getSimilarTracks: (artist: string, track: string, limit?: number) => Promise<readonly LastFmSimilarTrack[]>
  getSimilarArtists: (artist: string, limit?: number) => Promise<readonly LastFmSimilarArtist[]>
  getArtistTopTracks: (artist: string, limit?: number) => Promise<readonly LastFmSimilarTrack[]>
  searchTrack: (track: string, limit?: number) => Promise<readonly LastFmSearchResult[]>
  getTrackTopTags: (artist: string, track: string) => Promise<readonly LastFmTag[]>
}>

export type GroqPort = Readonly<{
  recommend: (
    artist: string,
    song: string,
    excludeTitles: ReadonlySet<string>,
    limit: number,
    artistHistory: readonly string[],
    genreTags: readonly string[],
  ) => Promise<readonly GroqCandidate[]>
  parseTitle: (title: string) => Promise<ParsedTrack | null>
}>

export type MusicRecommendPort = Readonly<{
  findRelated: (
    title: string,
    history: readonly string[],
    opts?: RecommendOpts,
  ) => Promise<RadioResult | null>
}>

export type VoiceConnectionPort = Readonly<{
  join: (guildId: string, channelId: string, adapterCreator: unknown) => Promise<Result<void, string>>
  destroy: (guildId: string) => void
  isConnected: (guildId: string) => boolean
}>

export type AudioPlayerPort = Readonly<{
  play: (guildId: string, resource: AudioResourceHandle) => void
  stop: (guildId: string) => void
  pause: (guildId: string) => void
  unpause: (guildId: string) => void
  isPaused: (guildId: string) => boolean
  onIdle: (guildId: string, cb: (guildId: string) => void) => void
  onError: (guildId: string, cb: (guildId: string, err: Error) => void) => void
  getStatus: (guildId: string) => string
  subscribeToConnection: (guildId: string) => void
  destroy: (guildId: string) => void
}>

export type NotificationPort = Readonly<{
  sendQueueUpdate: (guildId: string, payload: QueuePayload) => Promise<void>
  editMessage: (guildId: string, payload: QueuePayload) => Promise<void>
  deleteMessage: (guildId: string) => Promise<void>
}>

export type CookieStorePort = Readonly<{
  read: () => string | null
  write: (content: string) => void
  validate: () => CookieValidation
  delete: () => void
  filePath: () => string | null
}>

export type BrowserPort = Readonly<{
  init: () => Promise<Result<void, string>>
  close: () => Promise<void>
  refresh: () => Promise<CookieRefreshResult>
  extract: () => Promise<CookieRefreshResult>
  setupLogin: () => Promise<Result<{ url: string; instructions: string }, string>>
  isActive: () => boolean
  resetProfile: () => Promise<void>
}>

export type BlacklistRepository = Readonly<{
  getAll: () => readonly BlacklistEntry[]
  add: (guildId: string, name: string) => void
  remove: (guildId: string) => boolean
  isBlacklisted: (guildId: string) => boolean
}>

export type GuildInfoPort = Readonly<{
  list: () => readonly GuildInfo[]
  leave: (guildId: string) => Promise<Result<void, string>>
  voiceChannelName: (guildId: string, channelId: string) => string | null
}>

export type LoggerPort = Readonly<{
  info: (service: string, msg: string, meta?: Record<string, unknown>) => void
  warn: (service: string, msg: string, meta?: Record<string, unknown>) => void
  error: (service: string, msg: string, meta?: Record<string, unknown>) => void
  debug: (service: string, msg: string, meta?: Record<string, unknown>) => void
  event: (service: string, msg: string, meta?: Record<string, unknown>) => void
}>

export type Ports = Readonly<{
  audio: AudioStreamPort
  search: TrackSearchPort
  recommend: MusicRecommendPort
  lastfm: LastFmPort
  groq: GroqPort
  voice: VoiceConnectionPort
  player: AudioPlayerPort
  notify: NotificationPort
  cookieStore: CookieStorePort
  browser: BrowserPort
  blacklist: BlacklistRepository
  guilds: GuildInfoPort
  logger: LoggerPort
}>

export const isCookieError = (msg: string): boolean => {
  const patterns = [
    /sign in to confirm/i,
    /please sign in/i,
    /http error 403/i,
    /consent age gate/i,
    /youtube.*cookie/i,
    /rejected.*cookie/i,
    /account.*unavailable/i,
    /authentication.*required/i,
    /page needs to be reloaded/i,
    /page loads failed/i,
    /bot check/i,
  ]
  return patterns.some(p => p.test(msg))
}

export const withCookieRetry = async <T>(
  fn: () => Promise<Result<T, string>>,
  refresh: () => Promise<CookieRefreshResult>,
): Promise<Result<T, string>> => {
  const attempt = async (retried: boolean): Promise<Result<T, string>> => {
    const result = await fn()
    if (!result.ok && !retried && isCookieError(result.error)) {
      const refreshed = await refresh()
      if (refreshed.success) return attempt(true)
    }
    return result
  }
  return attempt(false)
}
