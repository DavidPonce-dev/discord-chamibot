import type { AudioResource } from "@discordjs/voice"

export type LoopMode = "none" | "one" | "all"

export type Track = Readonly<{
  title: string
  url: string
  requestedBy: string
  duration?: string
  id?: string
  thumbnail?: string
  canonicalTitle?: string
  artist?: string
  song?: string
  album?: string
}>

export type Queue = Readonly<{
  userTracks: readonly Track[]
  radioTracks: readonly Track[]
  current: Track | null
  loopMode: LoopMode
}>

export type PlaybackState = Readonly<{
  isPlaying: boolean
  isPaused: boolean
  playbackStart: number | null
  pauseOffset: number
  pauseTime: number | null
  seeking: boolean
}>

export type GuildPrefs = Readonly<{
  autoplay: boolean
  lastfmUsername: string | null
}>

export type GuildSession = Readonly<{
  guildId: string
  queue: Queue
  playback: PlaybackState
  prefs: GuildPrefs
  voiceChannelId: string | null
  queuePage: number
  last5Tracks: readonly string[]
  last5Ids: readonly string[]
  prefetchedUrl: { trackUrl: string; audioUrl: string } | null
  artistHistory: readonly string[]
  sameArtistStreak: number
  currentArtist: string | null
  radioBaseTitle: string | null
  radioNext: Track | null
  destroyed: boolean
}>

export type BlacklistEntry = Readonly<{
  guildId: string
  guildName: string
  blacklistedAt: string
}>

export type RadioResult = Readonly<{
  track: Omit<Track, "requestedBy">
  canonicalTitle?: string
}>

export type ResolvedTrack = Readonly<{
  url: string
  title: string
  duration?: string
  id?: string
  thumbnail?: string
  track?: string
  artist?: string
  album?: string
  channel?: string
}>

export type ResolveResult = Readonly<{
  tracks: readonly ResolvedTrack[]
  playlistTitle?: string
  type?: "single" | "album" | "playlist"
}>

export type VideoSearchResult = Readonly<{
  title?: string
  url?: string
  id?: string
  durationRaw?: string
}>

export type CookieValidation = Readonly<{
  isValid: boolean
  cookieCount: number
  cookieNames: readonly string[]
  hasPSID: boolean
  hasSID: boolean
  lastModified: Date | null
}>

export type CookieRefreshResult = Readonly<{
  success: boolean
  cookieCount?: number
  cookieNames?: readonly string[]
  isLoggedIn?: boolean
  timestamp: string
  error?: string
}>

export type GuildMusicInfo = Readonly<{
  connected: boolean
  voiceChannel?: string | null
  currentTrack?: Readonly<{
    title: string
    url: string
    requestedBy: string
    duration: string | null
    position: number
  }> | null
  queueSize?: number
  isPaused?: boolean
  autoplay?: boolean
  loopMode?: LoopMode
}>

export type GuildInfo = Readonly<{
  id: string
  name: string
  memberCount: number
  blacklisted: boolean
  music: GuildMusicInfo
}>

export type AutocompleteChoice = Readonly<{
  name: string
  value: string
}>

export type GroqCandidate = Readonly<{
  name: string
  artist: string
}>

export type ParsedTrack = Readonly<{
  artist: string | null
  song: string | null
}>

export type QueuePayload = Readonly<{
  embeds: readonly unknown[]
  components: readonly unknown[]
}>

export type RecommendOpts = Readonly<{
  shouldSwitch?: boolean
  currentArtist?: string | null
  artistHistory?: readonly string[]
  excludeIds?: readonly string[]
}>

export type AudioResourceHandle = AudioResource

export type LastFmSimilarTrack = Readonly<{
  name: string
  artist: string
  match: number
  url: string
  duration?: number
}>

export type LastFmSimilarArtist = Readonly<{
  name: string
  match: number
  url: string
}>

export type LastFmSearchResult = Readonly<{
  name: string
  artist: string
  listeners: number
  url: string
}>

export type LastFmTag = Readonly<{
  name: string
  count?: number
}>

export type CookieRefresherConfig = Readonly<{
  cookieDir: string
  cookieFile: string
  browserProfile: string
  refreshTimeoutMs: number
}>
