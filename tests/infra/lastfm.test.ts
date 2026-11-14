import { describe, it, expect, vi, beforeEach } from "vitest"

const { constructed } = vi.hoisted(() => ({ constructed: [] as unknown[][] }))

vi.mock("lastfm-ts-api", () => {
  class FakeApi {
    constructor(...args: unknown[]) { constructed.push(args) }
    getSimilar = async () => ({
      similartracks: { track: [{ name: "Venus", artist: { name: "Air" }, match: "0.9", url: "u" }] },
      similarartists: { artist: [{ name: "Zero 7", match: 0.8, url: "u" }] },
    })
  }
  return { LastFMTrack: FakeApi, LastFMArtist: FakeApi }
})

import { createLastFmAdapter } from "@/infra/recommendation/lastfm"
import { LASTFM_TIMEOUT_MS } from "@/config/timeouts"

describe("infra/recommendation/lastfm", () => {
  beforeEach(() => { constructed.length = 0 })

  // Without a timeout a hung request never settles, and the radio stays silent waiting for it
  it("configura un timeout en las peticiones de temas y de artistas", async () => {
    const lastfm = createLastFmAdapter("key")

    await lastfm.getSimilarTracks("Air", "Sexy Boy")
    await lastfm.getSimilarArtists("Air")

    expect(constructed).toHaveLength(2)
    for (const args of constructed) {
      expect(args[0]).toBe("key")
      expect(args[3]).toMatchObject({ timeout: LASTFM_TIMEOUT_MS })
    }
  })

  it("convierte los temas similares", async () => {
    const lastfm = createLastFmAdapter("key")
    expect(await lastfm.getSimilarTracks("Air", "Sexy Boy")).toEqual([
      { name: "Venus", artist: "Air", match: 0.9, url: "u", duration: undefined },
    ])
  })
})
