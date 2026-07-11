import { describe, it, expect, beforeEach, vi } from "vitest"
import { GuildManager } from "@/music/GuildManager"

const createMockQueueMethods = vi.hoisted(() => {
  return () => ({
    add: vi.fn(),
    addMultiple: vi.fn(),
    addNext: vi.fn(),
    getQueue: vi.fn().mockReturnValue([]),
    getCurrentTrack: vi.fn().mockReturnValue(null),
    getSize: vi.fn().mockReturnValue(0),
    getPosition: vi.fn().mockReturnValue(0),
    shuffle: vi.fn(),
    remove: vi.fn().mockReturnValue(null),
    moveUp: vi.fn().mockReturnValue(false),
    moveDown: vi.fn().mockReturnValue(false),
    toggleLoop: vi.fn().mockReturnValue("none" as const),
    getLoopMode: vi.fn().mockReturnValue("none" as const),
    seek: vi.fn(),
    clear: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    togglePause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    toggleAutoplay: vi.fn().mockReturnValue(false),
    isAutoplayEnabled: vi.fn().mockReturnValue(false),
    onTrackChange: undefined,
    onDisconnect: undefined,
  })
})

vi.mock("@/music/TrackScheduler", () => ({
  TrackScheduler: class {
    constructor() {
      return createMockQueueMethods() as any
    }
  },
}))

describe("GuildManager", () => {
  let manager: GuildManager

  beforeEach(() => {
    manager = new GuildManager()
  })

  describe("sesiones", () => {
    it("get de guild inexistente devuelve undefined", () => {
      expect(manager.get("nonexistent")).toBeUndefined()
    })

    it("create + get devuelve la misma sesión", () => {
      const conn = { subscribe: vi.fn(), destroy: vi.fn(), joinConfig: { guildId: "guild-1" }, on: vi.fn() } as any
      const session = manager.create("guild-1", conn)
      expect(manager.get("guild-1")).toBe(session)
    })

    it("has devuelve true para sesión existente", () => {
      const conn = { subscribe: vi.fn(), destroy: vi.fn(), joinConfig: { guildId: "guild-1" }, on: vi.fn() } as any
      manager.create("guild-1", conn)
      expect(manager.has("guild-1")).toBe(true)
    })

    it("has devuelve false para sesión inexistente", () => {
      expect(manager.has("nonexistent")).toBe(false)
    })

    it("delete de guild existente la remueve", () => {
      const conn = { subscribe: vi.fn(), destroy: vi.fn(), joinConfig: { guildId: "guild-1" }, on: vi.fn() } as any
      manager.create("guild-1", conn)
      manager.delete("guild-1")
      expect(manager.get("guild-1")).toBeUndefined()
    })

    it("delete de guild inexistente no lanza error", () => {
      expect(() => manager.delete("nonexistent")).not.toThrow()
    })

    it("múltiples guilds no interfieren entre sí", () => {
      const connA = { subscribe: vi.fn(), destroy: vi.fn(), joinConfig: { guildId: "guild-a" }, on: vi.fn() } as any
      const connB = { subscribe: vi.fn(), destroy: vi.fn(), joinConfig: { guildId: "guild-b" }, on: vi.fn() } as any
      const a = manager.create("guild-a", connA)
      const b = manager.create("guild-b", connB)
      expect(manager.get("guild-a")).toBe(a)
      expect(manager.get("guild-b")).toBe(b)
      expect(a).not.toBe(b)
    })
  })

  describe("autoplayPrefs", () => {
    it("default es false", () => {
      expect(manager.getAutoplayPref("guild-1")).toBe(false)
    })

    it("toggle true cambia a true", () => {
      const result = manager.toggleAutoplayPref("guild-1")
      expect(result).toBe(true)
      expect(manager.getAutoplayPref("guild-1")).toBe(true)
    })

    it("doble toggle vuelve a false", () => {
      manager.toggleAutoplayPref("guild-1")
      manager.toggleAutoplayPref("guild-1")
      expect(manager.getAutoplayPref("guild-1")).toBe(false)
    })

    it("guilds distintas tienen prefs independientes", () => {
      manager.toggleAutoplayPref("guild-a")
      manager.toggleAutoplayPref("guild-b")
      manager.toggleAutoplayPref("guild-b")
      expect(manager.getAutoplayPref("guild-a")).toBe(true)
      expect(manager.getAutoplayPref("guild-b")).toBe(false)
    })
  })

  describe("queueMessages", () => {
    it("set + get devuelve el mensaje", () => {
      const msg = { id: "msg-1" } as any
      manager.setQueueMessage("guild-1", msg)
      expect(manager.getQueueMessage("guild-1")).toBe(msg)
    })

    it("clear elimina el mensaje", () => {
      const msg = { id: "msg-1" } as any
      manager.setQueueMessage("guild-1", msg)
      manager.clearQueueMessage("guild-1")
      expect(manager.getQueueMessage("guild-1")).toBeUndefined()
    })

    it("get de guild sin mensaje devuelve undefined", () => {
      expect(manager.getQueueMessage("guild-1")).toBeUndefined()
    })
  })
})
