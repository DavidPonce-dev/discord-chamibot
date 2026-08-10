import { describe, it, expect } from "vitest"
import { createAdminUseCases } from "@/usecases/admin"
import { createMockPorts } from "./mock-ports"
import type { GuildSession } from "@/domain/types"
import { createSession } from "@/domain/session"

describe("usecases/admin", () => {
  describe("deploy mode", () => {
    it("defaults to false", () => {
      const admin = createAdminUseCases(createMockPorts())
      expect(admin.isDeployMode()).toBe(false)
    })

    it("toggles deploy mode on and disconnects sessions", () => {
      const admin = createAdminUseCases(createMockPorts())
      const sessions = new Map<string, GuildSession>()
      sessions.set("g1", createSession("g1", "v1"))
      sessions.set("g2", createSession("g2", "v2"))

      let destroyed = 0
      const result = admin.toggleDeployMode(sessions, () => { destroyed++ })
      expect(result.deployMode).toBe(true)
      expect(result.disconnectedGuilds).toBe(2)
      expect(destroyed).toBe(2)
    })

    it("toggles deploy mode off", () => {
      const admin = createAdminUseCases(createMockPorts())
      const sessions = new Map<string, GuildSession>()
      admin.toggleDeployMode(sessions, () => {})
      const result = admin.toggleDeployMode(sessions, () => {})
      expect(result.deployMode).toBe(false)
      expect(result.disconnectedGuilds).toBe(0)
    })
  })

  describe("blacklist", () => {
    it("removeBlacklist returns not_found when not in list", () => {
      const admin = createAdminUseCases(createMockPorts())
      const result = admin.removeBlacklist("nonexistent")
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe("not_found")
    })

    it("getBlacklist returns empty by default", () => {
      const admin = createAdminUseCases(createMockPorts())
      expect(admin.getBlacklist()).toEqual([])
    })
  })

  describe("leaveGuild", () => {
    it("calls destroySession and leaves guild", async () => {
      const admin = createAdminUseCases(createMockPorts())
      let destroyed = false
      const result = await admin.leaveGuild("g1", () => { destroyed = true })
      expect(destroyed).toBe(true)
      expect(result.ok).toBe(true)
    })
  })

  describe("blacklistGuild", () => {
    it("adds guild to blacklist and leaves", async () => {
      let addedId = ""
      const ports = createMockPorts({
        blacklist: {
          getAll: () => [],
          add: (id: string) => { addedId = id },
          remove: () => false,
          isBlacklisted: () => false,
        },
      })
      const admin = createAdminUseCases(ports)
      const result = await admin.blacklistGuild("g1", () => {})
      expect(addedId).toBe("g1")
      expect(result.ok).toBe(true)
    })
  })

  describe("getGuildsStatus", () => {
    it("returns guild list", () => {
      const ports = createMockPorts({
        guilds: {
          list: () => [{ id: "g1", name: "Test", memberCount: 10, blacklisted: false, music: { connected: false } }],
          leave: async () => ({ ok: true as const, value: undefined }),
          voiceChannelName: () => null,
        },
      })
      const admin = createAdminUseCases(ports)
      const sessions = new Map<string, GuildSession>()
      const result = admin.getGuildsStatus(sessions, () => 0)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("g1")
    })
  })
})
