import { describe, it, expect, vi } from "vitest"
import { createRadioUseCases } from "@/usecases/radio"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"

describe("usecases/radio", () => {
  const setup = async () => {
    const ports = createMockPorts()
    const music = createMusicUseCases(ports)
    await music.play("test", "g1", "u1", "v1", {})
    const setSession = (guildId: string, session: Parameters<typeof music.setSession>[1]) => music.setSession(guildId, session)
    const radio = createRadioUseCases(ports, music.getSession, setSession, music.prefetchRadioUrl)
    return { music, radio }
  }

  describe("toggleAutoplay", () => {
    it("returns error with no session", async () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const radio = createRadioUseCases(ports, music.getSession, () => {}, music.prefetchRadioUrl)
      const result = await radio.toggleAutoplay("g1")
      expect(result.ok).toBe(false)
    })

    it("toggles autoplay on", async () => {
      const { music, radio } = await setup()
      const result = await radio.toggleAutoplay("g1")
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(true)

      const session = music.getSession("g1")
      expect(session!.prefs.autoplay).toBe(true)
    })

    it("toggles autoplay off", async () => {
      const { music, radio } = await setup()
      await radio.toggleAutoplay("g1")
      const result = await radio.toggleAutoplay("g1")
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(false)

      const session = music.getSession("g1")
      expect(session!.prefs.autoplay).toBe(false)
    })

    it("forces an immediate recommendation when enabling with a track playing", async () => {
      const ports = createMockPorts({
        recommend: {
          findRelated: async () => ({
            track: { title: "Next Song", url: "https://youtube.com/watch?v=next", duration: "3:00", id: "next" },
            canonicalTitle: "Artist - Next Song",
          }),
        },
      })
      const music = createMusicUseCases(ports)
      await music.play("test", "g1", "u1", "v1", {})
      const setSession = (guildId: string, session: Parameters<typeof music.setSession>[1]) => music.setSession(guildId, session)
      const radio = createRadioUseCases(ports, music.getSession, setSession, music.prefetchRadioUrl)

      const result = await radio.toggleAutoplay("g1")
      expect(result.ok).toBe(true)

      const session = music.getSession("g1")!
      expect(session.prefs.autoplay).toBe(true)
      expect(session.queue.radioTracks).toHaveLength(1)
      expect(session.queue.radioTracks[0].id).toBe("next")
      expect(session.radioBaseTitle).toBe("Artist - Next Song")
      expect(session.prefetchedUrl).toEqual({
        trackUrl: "https://youtube.com/watch?v=next",
        audioUrl: "https://audio.example/stream",
      })
    })

    it("does not enqueue a radio track when findRelated returns null", async () => {
      const { music, radio } = await setup()
      const result = await radio.toggleAutoplay("g1")
      expect(result.ok).toBe(true)

      const session = music.getSession("g1")!
      expect(session.prefs.autoplay).toBe(true)
      expect(session.queue.radioTracks).toHaveLength(0)
      expect(session.prefetchedUrl).toBeNull()
    })
  })

  describe("reshuffleRadio", () => {
    it("returns error with no session", async () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const radio = createRadioUseCases(ports, music.getSession, () => {}, music.prefetchRadioUrl)
      const result = await radio.reshuffleRadio("g1", 0)
      expect(result.ok).toBe(false)
    })

    it("returns invalid_index for out of range", async () => {
      const { radio } = await setup()
      const result = await radio.reshuffleRadio("g1", 99)
      expect(result.ok).toBe(false)
    })

    it("replaces the radio track passing excludeIds", async () => {
      const findRelated = vi.fn().mockResolvedValue({
        track: { title: "Shuffled", url: "https://youtube.com/watch?v=shuf", duration: "3:00", id: "shuf" },
        canonicalTitle: "Artist - Shuffled",
      })
      const ports = createMockPorts({ recommend: { findRelated } })
      const music = createMusicUseCases(ports)
      await music.play("test", "g1", "u1", "v1", {})
      const setSession = (guildId: string, session: Parameters<typeof music.setSession>[1]) => music.setSession(guildId, session)
      const radio = createRadioUseCases(ports, music.getSession, setSession, music.prefetchRadioUrl)
      await radio.toggleAutoplay("g1")

      const result = await radio.reshuffleRadio("g1", 0)
      expect(result.ok).toBe(true)

      expect(findRelated).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ excludeIds: ["test123"] }),
      )

      const session = music.getSession("g1")!
      expect(session.queue.radioTracks[0].id).toBe("shuf")
      expect(session.prefetchedUrl?.trackUrl).toBe("https://youtube.com/watch?v=shuf")
    })
  })
})
