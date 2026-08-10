import type { GuildSession, Track } from "./types"
import { emptyQueue } from "./queue"

export const createSession = (guildId: string, voiceChannelId: string): GuildSession => ({
  guildId,
  queue: emptyQueue(),
  playback: {
    isPlaying: false,
    isPaused: false,
    playbackStart: null,
    pauseOffset: 0,
    pauseTime: null,
    seeking: false,
  },
  prefs: {
    autoplay: false,
    lastfmUsername: null,
  },
  voiceChannelId,
  queuePage: 1,
  last5Tracks: [],
  last5Ids: [],
  prefetchedUrl: null,
  artistHistory: [],
  sameArtistStreak: 0,
  currentArtist: null,
  radioBaseTitle: null,
  radioNext: null,
  reshufflingRadioIndex: null,
  destroyed: false,
})

export const getPosition = (s: GuildSession): number => {
  if (!s.playback.playbackStart) return 0
  let elapsed = Date.now() - s.playback.playbackStart - s.playback.pauseOffset
  if (s.playback.pauseTime !== null) {
    elapsed -= Date.now() - s.playback.pauseTime
  }
  return Math.floor(elapsed / 1000)
}

export const onTrackFinished = (
  s: GuildSession,
  finished: Track,
  extractArtistFn: (title: string) => string,
): GuildSession => {
  const normalizedTitle = finished.title.toLowerCase()
  const last5 = [normalizedTitle, ...s.last5Tracks].slice(0, 5)
  const last5Ids = finished.id ? [finished.id, ...s.last5Ids].slice(0, 5) : s.last5Ids

  const artist = finished.artist || extractArtistFn(finished.title)
  let streak = s.sameArtistStreak
  let current = s.currentArtist
  let history = [...s.artistHistory]

  if (artist) {
    if (artist === current) {
      streak++
    } else {
      streak = 1
      current = artist
      history = [artist, ...history].slice(0, 10)
    }
  }

  return {
    ...s,
    last5Tracks: last5,
    last5Ids,
    sameArtistStreak: streak,
    currentArtist: current,
    artistHistory: history,
  }
}

export const setPlaying = (s: GuildSession, track: Track): GuildSession => ({
  ...s,
  queue: { ...s.queue, current: track },
  playback: {
    isPlaying: true,
    isPaused: false,
    playbackStart: Date.now(),
    pauseOffset: 0,
    pauseTime: null,
    seeking: false,
  },
})

export const setPaused = (s: GuildSession): GuildSession => ({
  ...s,
  playback: { ...s.playback, isPaused: true, pauseTime: Date.now() },
})

export const setResumed = (s: GuildSession): GuildSession => ({
  ...s,
  playback: {
    ...s.playback,
    isPaused: false,
    pauseTime: null,
    pauseOffset: s.playback.pauseOffset + (s.playback.pauseTime ? Date.now() - s.playback.pauseTime : 0),
  },
})

export const setStopped = (s: GuildSession): GuildSession => ({
  ...s,
  playback: {
    isPlaying: false,
    isPaused: false,
    playbackStart: null,
    pauseOffset: 0,
    pauseTime: null,
    seeking: false,
  },
  queue: { ...s.queue, current: null },
})

export const setSeeking = (s: GuildSession, seeking: boolean): GuildSession => ({
  ...s,
  playback: { ...s.playback, seeking },
})
