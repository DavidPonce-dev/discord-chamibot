import { describe, it, expect, vi } from "vitest"
import type { Mock } from "vitest"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"
import type { Ports } from "@/domain/ports"

describe("usecases/music", () => {
  describe("play", () => {
    it("returns error when in deploy mode", async () => {
      const music = createMusicUseCases(createMockPorts())
      music.setDeployMode(true)
      const result = await music.play("test", "g1", "u1", "v1", {})
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe("deploying")
    })

    it("creates session and plays track", async () => {
      const music = createMusicUseCases(createMockPorts())
      const result = await music.play("test query", "g1", "u1", "v1", {})
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].title).toBe("Test Track")
        expect(result.value[0].requestedBy).toBe("u1")
      }
    })

    it("adds track to existing session", async () => {
      const music = createMusicUseCases(createMockPorts())
      await music.play("first", "g1", "u1", "v1", {})
      const result = await music.play("second", "g1", "u2", "v1", {})
      expect(result.ok).toBe(true)
      const session = music.getSession("g1")
      expect(session).not.toBeNull()
      expect(session!.queue.userTracks.length).toBeGreaterThanOrEqual(1)
    })

    it("keeps playback isolated across guilds", async () => {
      const killProcess = vi.fn()
      const createResource = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
      const playerPlay = vi.fn()
      const ports = createMockPorts({
        audio: { ...createMockPorts().audio, killProcess, createResource },
        player: { ...createMockPorts().player, play: playerPlay },
        search: {
          ...createMockPorts().search,
          resolveQuery: async (query) => ({
            ok: true as const,
            value: {
              tracks: [
                query === "two"
                  ? { url: "u2", title: "Second", duration: "1:00", id: "b" }
                  : { url: "u1", title: "First", duration: "1:00", id: "a" },
              ],
            },
          }),
        } as Ports["search"],
      })
      const music = createMusicUseCases(ports)
      await music.play("one", "g1", "u1", "v1", {})
      await music.play("two", "g2", "u2", "v2", {})

      const g1 = music.getSession("g1")!
      const g2 = music.getSession("g2")!
      expect(g1.queue.current?.title).toBe("First")
      expect(g2.queue.current?.title).toBe("Second")

      expect(killProcess).toHaveBeenCalledWith("g1")
      expect(killProcess).toHaveBeenCalledWith("g2")
      expect(createResource).toHaveBeenNthCalledWith(1, "g1", "u1")
      expect(createResource).toHaveBeenNthCalledWith(2, "g2", "u2")
      expect(playerPlay).toHaveBeenNthCalledWith(1, "g1", expect.anything())
      expect(playerPlay).toHaveBeenNthCalledWith(2, "g2", expect.anything())
    })
  })

  describe("skip", () => {
    it("returns error with no session", () => {
      const music = createMusicUseCases(createMockPorts())
      const result = music.skip("g1")
      expect(result.ok).toBe(false)
    })

    it("skips successfully with session", async () => {
      const music = createMusicUseCases(createMockPorts())
      await music.play("test", "g1", "u1", "v1", {})
      const result = music.skip("g1")
      expect(result.ok).toBe(true)
    })
  })

  describe("pause / resume", () => {
    it("pause returns error with no session", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.pause("g1").ok).toBe(false)
    })

    it("resume returns error with no session", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.resume("g1").ok).toBe(false)
    })
  })

  describe("stop", () => {
    it("returns error with no session", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.stop("g1").ok).toBe(false)
    })

    it("destroys session", async () => {
      const music = createMusicUseCases(createMockPorts())
      await music.play("test", "g1", "u1", "v1", {})
      expect(music.getSession("g1")).not.toBeNull()
      music.stop("g1")
      expect(music.getSession("g1")).toBeNull()
    })

    it("deletes the queue message when stopped", async () => {
      const deleteMessage = vi.fn().mockResolvedValue(undefined)
      const ports = createMockPorts({ notify: { ...createMockPorts().notify, deleteMessage } })
      const music = createMusicUseCases(ports)
      await music.play("test", "g1", "u1", "v1", {})
      music.stop("g1")
      expect(deleteMessage).toHaveBeenCalledWith("g1")
    })
  })

  describe("session management", () => {
    it("getSession returns null for unknown guild", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.getSession("unknown")).toBeNull()
    })

    it("getSessions returns map", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.getSessions()).toBeInstanceOf(Map)
    })

    it("destroySession cleans up", async () => {
      const music = createMusicUseCases(createMockPorts())
      await music.play("test", "g1", "u1", "v1", {})
      music.destroySession("g1")
      expect(music.getSession("g1")).toBeNull()
    })
  })

  describe("deploy mode", () => {
    it("defaults to false", () => {
      const music = createMusicUseCases(createMockPorts())
      expect(music.isDeployMode()).toBe(false)
    })

    it("can be toggled", () => {
      const music = createMusicUseCases(createMockPorts())
      music.setDeployMode(true)
      expect(music.isDeployMode()).toBe(true)
      music.setDeployMode(false)
      expect(music.isDeployMode()).toBe(false)
    })
  })

  describe("idle handler", () => {
    const captureIdle = (ports: Ports): ((guildId: string) => void) =>
      (ports.player.onIdle as Mock).mock.calls[0][1] as (guildId: string) => void

    it("advances to the next user track on idle", async () => {
      const ports = createMockPorts({
        search: {
          ...createMockPorts().search,
          resolveQuery: async () => ({ ok: true as const, value: { tracks: [
            { url: "u1", title: "T1", duration: "1:00", id: "a" },
            { url: "u2", title: "T2", duration: "1:00", id: "b" },
          ] } }),
        } as Ports["search"],
      })
      const music = createMusicUseCases(ports)
      await music.play("multi", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      expect(session.queue.current?.title).toBe("T1")
      expect(session.queue.userTracks).toHaveLength(1)

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        const s = music.getSession("g1")!
        expect(s.queue.current?.title).toBe("T2")
      })
    })

    it("populates radioTracks after the last track with autoplay", async () => {
      const ports = createMockPorts({
        recommend: {
          findRelated: async () => ({
            track: { title: "Recommended", url: "ur", duration: "3:00", id: "r1" },
            canonicalTitle: "Some - Recommended",
          }),
        },
      } as Partial<Ports>)
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      music.setSession("g1", { ...session, prefs: { ...session.prefs, autoplay: true } })

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        const s = music.getSession("g1")!
        expect(s.queue.radioTracks.length).toBeGreaterThanOrEqual(1)
      })
    })

    it("fires onTrackChange immediately when radio generation starts", async () => {
      const ports = createMockPorts()
      const onTrackChange = vi.fn()
      const music = createMusicUseCases(ports, { onTrackChange })
      await music.play("solo", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      music.setSession("g1", { ...session, prefs: { ...session.prefs, autoplay: true } })
      onTrackChange.mockClear()

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(onTrackChange).toHaveBeenCalledWith("g1")
      })
    })

    it("prefetches the stream URL after populating radio", async () => {
      const getAudioUrl = vi.fn().mockResolvedValue({ ok: true as const, value: "https://stream.example/radio" })
      const ports = createMockPorts({
        audio: { ...createMockPorts().audio, getAudioUrl },
        recommend: {
          findRelated: async () => ({
            track: { title: "Recommended", url: "ur", duration: "3:00", id: "r1" },
            canonicalTitle: "Some - Recommended",
          }),
        },
      } as Partial<Ports>)
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      music.setSession("g1", { ...session, prefs: { ...session.prefs, autoplay: true } })

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(getAudioUrl).toHaveBeenCalledWith("ur")
      })
    })

    it("resets radioBaseTitle when a user track starts playing", async () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})
      await music.play("solo2", "g1", "u2", "v1", {})
      music.setSession("g1", { ...music.getSession("g1")!, radioBaseTitle: "Stale - Base" })

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        const s = music.getSession("g1")!
        expect(s.radioBaseTitle).toBeNull()
      })
    })

    it("uses the prefetched stream URL when it matches the next track", async () => {
      const createResource = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
      const createFromAudioUrl = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
      const ports = createMockPorts({
        audio: { ...createMockPorts().audio, createResource, createFromAudioUrl },
        search: {
          ...createMockPorts().search,
          resolveQuery: async () => ({ ok: true as const, value: { tracks: [
            { url: "u1", title: "T1", duration: "1:00", id: "a" },
            { url: "u2", title: "T2", duration: "1:00", id: "b" },
          ] } }),
        } as Ports["search"],
      })
      const music = createMusicUseCases(ports)
      await music.play("multi", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      music.setSession("g1", {
        ...session,
        prefetchedUrl: { trackUrl: "u2", audioUrl: "https://stream.example/audio" },
      })

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        const s = music.getSession("g1")!
        expect(s.queue.current?.title).toBe("T2")
      })
      expect(createFromAudioUrl).toHaveBeenCalledWith("g1", "https://stream.example/audio")
      expect(createResource).not.toHaveBeenCalledWith("g1", "u2")
      expect(music.getSession("g1")!.prefetchedUrl).toBeNull()
    })

    it("skip advances to the next track via idle", async () => {
      const ports = createMockPorts({
        search: {
          ...createMockPorts().search,
          resolveQuery: async () => ({ ok: true as const, value: { tracks: [
            { url: "u1", title: "First", duration: "1:00", id: "a" },
            { url: "u2", title: "Second", duration: "1:00", id: "b" },
          ] } }),
        } as Ports["search"],
      })
      const music = createMusicUseCases(ports)
      await music.play("multi", "g1", "u1", "v1", {})
      expect(music.getSession("g1")!.queue.current?.title).toBe("First")

      music.skip("g1")
      captureIdle(ports)("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")!.queue.current?.title).toBe("Second")
      })
    })

    it("destroys session when queue is empty and autoplay off", async () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})
      expect(music.getSession("g1")).not.toBeNull()

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")).toBeNull()
      })
    })

    it("deletes the queue message when the queue ends naturally", async () => {
      const deleteMessage = vi.fn().mockResolvedValue(undefined)
      const ports = createMockPorts({ notify: { ...createMockPorts().notify, deleteMessage } })
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(deleteMessage).toHaveBeenCalledWith("g1")
      })
    })

    it("retries the same track when the stream fails with a cookie error", async () => {
      const createResource = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
      const consumeStreamFailure = vi.fn()
        .mockReturnValueOnce(true)
        .mockReturnValue(false)
      const ports = createMockPorts({
        audio: { ...createMockPorts().audio, createResource, consumeStreamFailure },
      } as Partial<Ports>)
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})
      const session = music.getSession("g1")!
      expect(session.queue.current?.title).toBe("Test Track")

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")!.playback.isPlaying).toBe(true)
      })
      expect(createResource).toHaveBeenCalledTimes(2)
      const after = music.getSession("g1")!
      expect(after.queue.current?.title).toBe("Test Track")
    })

    it("destroys the session after stream retries are exhausted", async () => {
      const createResource = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
      const consumeStreamFailure = vi.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(false)
      const ports = createMockPorts({
        audio: { ...createMockPorts().audio, createResource, consumeStreamFailure },
      } as Partial<Ports>)
      const music = createMusicUseCases(ports)
      await music.play("solo", "g1", "u1", "v1", {})

      const onIdle = captureIdle(ports)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")!.playback.isPlaying).toBe(true)
      })
      expect(createResource).toHaveBeenCalledTimes(2)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")!.playback.isPlaying).toBe(true)
      })
      expect(createResource).toHaveBeenCalledTimes(3)
      onIdle("g1")
      await vi.waitFor(() => {
        expect(music.getSession("g1")).toBeNull()
      })
    })
  })
})
