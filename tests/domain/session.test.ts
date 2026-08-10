import { describe, it, expect } from "vitest"
import {
  createSession, getPosition, onTrackFinished,
  setPlaying, setPaused, setResumed, setStopped, setSeeking,
} from "@/domain/session"
import type { Track } from "@/domain/types"

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Test Track",
    url: "https://youtube.com/watch?v=test",
    requestedBy: "user1",
    ...overrides,
  }
}

describe("domain/session", () => {
  describe("createSession", () => {
    it("crea sesion con valores iniciales", () => {
      const session = createSession("guild-1", "voice-1")
      expect(session.guildId).toBe("guild-1")
      expect(session.voiceChannelId).toBe("voice-1")
      expect(session.queue.userTracks).toHaveLength(0)
      expect(session.playback.isPlaying).toBe(false)
      expect(session.prefs.autoplay).toBe(false)
      expect(session.prefs.lastfmUsername).toBeNull()
      expect(session.destroyed).toBe(false)
      expect(session.last5Ids).toHaveLength(0)
      expect(session.prefetchedUrl).toBeNull()
    })
  })

  describe("getPosition", () => {
    it("retorna 0 si no hay playbackStart", () => {
      const session = createSession("g1", "v1")
      expect(getPosition(session)).toBe(0)
    })

    it("retorna segundos transcurridos", () => {
      const now = Date.now()
      const session = {
        ...createSession("g1", "v1"),
        playback: { ...createSession("g1", "v1").playback, playbackStart: now - 5000, isPlaying: true },
      }
      const pos = getPosition(session)
      expect(pos).toBeGreaterThanOrEqual(4)
      expect(pos).toBeLessThanOrEqual(6)
    })
  })

  describe("onTrackFinished", () => {
    it("actualiza last5Tracks", () => {
      const session = createSession("g1", "v1")
      const result = onTrackFinished(session, makeTrack({ title: "Song A" }), () => "Artist")
      expect(result.last5Tracks).toContain("song a")
    })

    it("agrega el id de la pista a last5Ids", () => {
      const session = createSession("g1", "v1")
      const result = onTrackFinished(session, makeTrack({ id: "vid-123" }), () => "Artist")
      expect(result.last5Ids).toContain("vid-123")
    })

    it("no agrega last5Ids si la pista no tiene id", () => {
      const session = createSession("g1", "v1")
      const result = onTrackFinished(session, makeTrack({ id: undefined }), () => "Artist")
      expect(result.last5Ids).toHaveLength(0)
    })

    it("incrementa streak si mismo artista", () => {
      const session = { ...createSession("g1", "v1"), currentArtist: "Artist", sameArtistStreak: 2 }
      const result = onTrackFinished(session, makeTrack({ artist: "Artist" }), () => "Artist")
      expect(result.sameArtistStreak).toBe(3)
    })

    it("resetea streak si artista diferente", () => {
      const session = { ...createSession("g1", "v1"), currentArtist: "Artist A", sameArtistStreak: 5 }
      const result = onTrackFinished(session, makeTrack({ artist: "Artist B" }), () => "Artist B")
      expect(result.sameArtistStreak).toBe(1)
      expect(result.currentArtist).toBe("Artist B")
    })
  })

  describe("setPlaying", () => {
    it("setea estado de reproduccion", () => {
      const session = createSession("g1", "v1")
      const track = makeTrack()
      const result = setPlaying(session, track)
      expect(result.playback.isPlaying).toBe(true)
      expect(result.queue.current).toBe(track)
      expect(result.playback.playbackStart).not.toBeNull()
    })
  })

  describe("setPaused / setResumed", () => {
    it("pausa y reanuda correctamente", () => {
      const session = setPlaying(createSession("g1", "v1"), makeTrack())
      const paused = setPaused(session)
      expect(paused.playback.isPaused).toBe(true)
      expect(paused.playback.pauseTime).not.toBeNull()

      const resumed = setResumed(paused)
      expect(resumed.playback.isPaused).toBe(false)
      expect(resumed.playback.pauseTime).toBeNull()
    })
  })

  describe("setStopped", () => {
    it("resetea playback", () => {
      const session = setPlaying(createSession("g1", "v1"), makeTrack())
      const result = setStopped(session)
      expect(result.playback.isPlaying).toBe(false)
      expect(result.queue.current).toBeNull()
    })
  })

  describe("setSeeking", () => {
    it("setea flag de seeking", () => {
      const session = createSession("g1", "v1")
      const result = setSeeking(session, true)
      expect(result.playback.seeking).toBe(true)
      const result2 = setSeeking(result, false)
      expect(result2.playback.seeking).toBe(false)
    })
  })
})
