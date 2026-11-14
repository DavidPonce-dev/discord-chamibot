import type { GuildSession, Track } from "./types"
import { emptyQueue } from "./queue"
import { RADIO_HISTORY_LIMIT } from "../config/radio"

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
  recentTitles: [],
  recentIds: [],
  prefetchedUrl: null,
  artistHistory: [],
  sameArtistStreak: 0,
  currentArtist: null,
  radioBaseTitle: null,
  reshufflingRadioIndex: null,
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
  const recentTitles = [normalizedTitle, ...s.recentTitles].slice(0, RADIO_HISTORY_LIMIT)
  const recentIds = finished.id ? [finished.id, ...s.recentIds].slice(0, RADIO_HISTORY_LIMIT) : s.recentIds

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
    recentTitles,
    recentIds,
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
