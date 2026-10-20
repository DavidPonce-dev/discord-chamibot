import { extractVideoId } from "../../domain/track-parser"

const DEFAULT_TTL_MS = 60 * 60 * 1000
const EXPIRY_MARGIN_MS = 10 * 60 * 1000
const MAX_ENTRIES = 200

export type AudioUrlCache = Readonly<{
  get: (trackUrl: string) => string | null
  set: (trackUrl: string, audioUrl: string) => void
  invalidateAudioUrl: (audioUrl: string) => void
}>

export const isDirectAudioUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith("googlevideo.com")
  } catch {
    return false
  }
}

// googlevideo URLs carry their expiry (unix seconds) in the "expire" param
const computeExpiry = (audioUrl: string, now: number): number => {
  try {
    const expire = Number(new URL(audioUrl).searchParams.get("expire"))
    if (expire > 0) return expire * 1000 - EXPIRY_MARGIN_MS
  } catch {}
  return now + DEFAULT_TTL_MS
}

// Key by video id so "youtube.com/watch?v=X" and "www.youtube.com/watch?v=X" share an entry
const keyFor = (trackUrl: string): string => extractVideoId(trackUrl) ?? trackUrl

export const createAudioUrlCache = (now: () => number = Date.now): AudioUrlCache => {
  const entries = new Map<string, { readonly audioUrl: string; readonly expiresAt: number }>()

  const get = (trackUrl: string): string | null => {
    const key = keyFor(trackUrl)
    const entry = entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return null
    }
    return entry.audioUrl
  }

  const set = (trackUrl: string, audioUrl: string): void => {
    const key = keyFor(trackUrl)
    entries.delete(key)
    entries.set(key, { audioUrl, expiresAt: computeExpiry(audioUrl, now()) })
    if (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next().value
      if (oldest !== undefined) entries.delete(oldest)
    }
  }

  const invalidateAudioUrl = (audioUrl: string): void => {
    for (const [key, entry] of entries) {
      if (entry.audioUrl === audioUrl) entries.delete(key)
    }
  }

  return { get, set, invalidateAudioUrl } as const
}
