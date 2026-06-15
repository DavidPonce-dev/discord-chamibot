import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AudioResource } from "@discordjs/voice"
import type { Track } from "@/core/types"

const mockCreateResource = vi.hoisted(() => vi.fn<() => Promise<AudioResource>>())
const mockKillProcess = vi.hoisted(() => vi.fn())
const mockFindRelated = vi.hoisted(() => vi.fn())

vi.mock("@/services/audio/AudioService", () => ({
  AudioService: class {
    constructor() {
      return {
        createResource: mockCreateResource,
        killProcess: mockKillProcess,
      } as any
    }
  },
}))

vi.mock("@/services/radio/RadioService", () => ({
  RadioService: class {
    constructor() {
      return { findRelated: mockFindRelated } as any
    }
  },
}))

const { TrackScheduler } = await import("@/services/scheduler/TrackScheduler")

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Test Track",
    url: "https://youtube.com/watch?v=test123",
    requestedBy: "tester",
    duration: "3:30",
    id: "test123",
    thumbnail: "https://img.youtube.com/vi/test123/hqdefault.jpg",
    ...overrides,
  }
}

function createScheduler(autoplay = false) {
  const conn = {
    subscribe: vi.fn(),
    destroy: vi.fn(),
    joinConfig: { guildId: "test-guild" },
    on: vi.fn(),
  } as any
  return { scheduler: new TrackScheduler(conn, autoplay), conn }
}

describe("TrackScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateResource.mockResolvedValue({} as AudioResource)
  })

  describe("estado inicial", () => {
    it("cola vacía", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.getQueue()).toEqual([])
      expect(scheduler.getSize()).toBe(0)
    })

    it("no hay track actual", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.getCurrentTrack()).toBeNull()
    })

    it("posición es 0", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.getPosition()).toBe(0)
    })

    it("no está pausado", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.isPaused()).toBe(false)
    })

    it("loop mode es none", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.getLoopMode()).toBe("none")
    })

    it("autoplay default es false", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.isAutoplayEnabled()).toBe(false)
    })

    it("autoplay=true se respeta", () => {
      const { scheduler } = createScheduler(true)
      expect(scheduler.isAutoplayEnabled()).toBe(true)
    })
  })

  describe("operaciones de cola", () => {
    it("add dispara processQueue (createResource es llamado)", async () => {
      const { scheduler } = createScheduler()
      await scheduler.add(makeTrack())
      expect(mockCreateResource).toHaveBeenCalled()
    })

    it("addNext agrega al frente sin reproducir", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack({ title: "B" }))
      scheduler.addNext(makeTrack({ title: "A" }))
      expect(scheduler.getSize()).toBe(2)
      expect(scheduler.getQueue()[0].title).toBe("A")
      expect(scheduler.getQueue()[1].title).toBe("B")
    })

    it("remove devuelve track removido (addNext agrega al frente)", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack({ title: "B" })) // cola: [B]
      scheduler.addNext(makeTrack({ title: "A" })) // cola: [A, B]
      const removed = scheduler.remove(0)
      expect(removed).not.toBeNull()
      expect(removed!.title).toBe("A")
      expect(scheduler.getSize()).toBe(1)
    })

    it("remove índice negativo devuelve null", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.remove(-1)).toBeNull()
    })

    it("remove índice mayor al size devuelve null", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.remove(5)).toBeNull()
    })

    it("moveUp primer elemento devuelve false", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      scheduler.addNext(makeTrack())
      expect(scheduler.moveUp(0)).toBe(false)
    })

    it("moveDown último elemento devuelve false", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      scheduler.addNext(makeTrack())
      expect(scheduler.moveDown(1)).toBe(false)
    })

    it("moveDown intercambia posiciones (addNext agrega al frente)", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack({ title: "C" })) // cola: [C]
      scheduler.addNext(makeTrack({ title: "B" })) // cola: [B, C]
      scheduler.addNext(makeTrack({ title: "A" })) // cola: [A, B, C]
      expect(scheduler.moveDown(0)).toBe(true)
      expect(scheduler.getQueue()[0].title).toBe("B")
      expect(scheduler.getQueue()[1].title).toBe("A")
    })

    it("shuffle no explota en cola vacía", () => {
      const { scheduler } = createScheduler()
      expect(() => scheduler.shuffle()).not.toThrow()
    })

    it("clear vacía la cola", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      scheduler.addNext(makeTrack())
      scheduler.clear()
      expect(scheduler.getSize()).toBe(0)
    })

    it("getQueue devuelve una copia", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      const q = scheduler.getQueue()
      q.pop()
      expect(scheduler.getSize()).toBe(1)
    })
  })

  describe("loop modes", () => {
    it("toggleLoop cicla none → one → all → none", () => {
      const { scheduler } = createScheduler()
      expect(scheduler.toggleLoop()).toBe("one")
      expect(scheduler.toggleLoop()).toBe("all")
      expect(scheduler.toggleLoop()).toBe("none")
    })

    it("getLoopMode refleja el estado actual", () => {
      const { scheduler } = createScheduler()
      scheduler.toggleLoop()
      expect(scheduler.getLoopMode()).toBe("one")
    })
  })

  describe("pause / resume — position tracking", () => {
    it("pause no revienta sin playback", () => {
      const { scheduler } = createScheduler()
      expect(() => scheduler.pause()).not.toThrow()
    })

    it("resume no revienta sin playback", () => {
      const { scheduler } = createScheduler()
      expect(() => scheduler.resume()).not.toThrow()
    })

    it("togglePause no explota", () => {
      const { scheduler } = createScheduler()
      expect(() => {
        scheduler.togglePause()
        scheduler.togglePause()
      }).not.toThrow()
    })
  })

  describe("autoplay toggle", () => {
    it("toggleAutoplay cambia el estado", async () => {
      const { scheduler } = createScheduler()
      expect(await scheduler.toggleAutoplay()).toBe(true)
      expect(scheduler.isAutoplayEnabled()).toBe(true)
      expect(await scheduler.toggleAutoplay()).toBe(false)
    })
  })

  describe("stop / destroy", () => {
    it("stop resetea cola y mata proceso", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      scheduler.stop()
      expect(scheduler.getSize()).toBe(0)
      expect(mockKillProcess).toHaveBeenCalled()
    })

    it("destroy mata conexión", () => {
      const { scheduler, conn } = createScheduler()
      scheduler.destroy()
      expect(conn.destroy).toHaveBeenCalled()
    })
  })

  describe("errores inesperados", () => {
    it("createResource lanza → processQueue resetea isPlaying y current", async () => {
      mockCreateResource.mockRejectedValue(new Error("yt-dlp exploded"))

      const { scheduler } = createScheduler()
      await scheduler.add(makeTrack())

      // processQueue intentó reproducir y falló
      // Después del catch: isPlaying=false, current=null
      expect(scheduler.getCurrentTrack()).toBeNull()
      // Al no haber más tracks, queda en idle estable
      expect(scheduler.getSize()).toBe(0)
    })

    it("skip mata proceso y detiene player", () => {
      const { scheduler } = createScheduler()
      scheduler.addNext(makeTrack())
      scheduler.skip()
      expect(mockKillProcess).toHaveBeenCalled()
    })
  })
})
