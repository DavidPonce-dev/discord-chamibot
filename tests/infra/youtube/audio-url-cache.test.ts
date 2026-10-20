import { describe, it, expect } from "vitest"
import { createAudioUrlCache, isDirectAudioUrl } from "@/infra/youtube/audio-url-cache"

const streamUrl = (expireSec: number, n = 1): string =>
  `https://rr${n}---sn-abc.googlevideo.com/videoplayback?expire=${expireSec}&id=x`

describe("infra/youtube/audio-url-cache", () => {
  it("shares entries between URL variants of the same video", () => {
    const cache = createAudioUrlCache(() => 0)
    cache.set("https://www.youtube.com/watch?v=abc", streamUrl(100_000))
    expect(cache.get("https://youtube.com/watch?v=abc")).toBe(streamUrl(100_000))
  })

  it("expires entries before the googlevideo expire timestamp", () => {
    let now = 0
    const cache = createAudioUrlCache(() => now)
    cache.set("https://youtube.com/watch?v=abc", streamUrl(3600))
    now = 3600 * 1000 - 11 * 60 * 1000
    expect(cache.get("https://youtube.com/watch?v=abc")).not.toBeNull()
    now = 3600 * 1000 - 9 * 60 * 1000
    expect(cache.get("https://youtube.com/watch?v=abc")).toBeNull()
  })

  it("falls back to a default TTL when the URL has no expire param", () => {
    let now = 0
    const cache = createAudioUrlCache(() => now)
    cache.set("https://youtube.com/watch?v=abc", "https://rr1---sn.googlevideo.com/videoplayback")
    now = 59 * 60 * 1000
    expect(cache.get("https://youtube.com/watch?v=abc")).not.toBeNull()
    now = 61 * 60 * 1000
    expect(cache.get("https://youtube.com/watch?v=abc")).toBeNull()
  })

  it("invalidates by stream URL", () => {
    const cache = createAudioUrlCache(() => 0)
    cache.set("https://youtube.com/watch?v=a", streamUrl(100_000, 1))
    cache.set("https://youtube.com/watch?v=b", streamUrl(100_000, 2))
    cache.invalidateAudioUrl(streamUrl(100_000, 1))
    expect(cache.get("https://youtube.com/watch?v=a")).toBeNull()
    expect(cache.get("https://youtube.com/watch?v=b")).not.toBeNull()
  })

  it("evicts the oldest entry when full", () => {
    const cache = createAudioUrlCache(() => 0)
    for (let i = 0; i <= 200; i++) cache.set(`https://youtube.com/watch?v=v${i}`, streamUrl(100_000, i))
    expect(cache.get("https://youtube.com/watch?v=v0")).toBeNull()
    expect(cache.get("https://youtube.com/watch?v=v200")).not.toBeNull()
  })

  it("recognizes direct stream URLs", () => {
    expect(isDirectAudioUrl(streamUrl(1))).toBe(true)
    expect(isDirectAudioUrl("https://www.youtube.com/watch?v=abc")).toBe(false)
    expect(isDirectAudioUrl("not a url")).toBe(false)
  })
})
