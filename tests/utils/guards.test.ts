import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ChatInputCommandInteraction, ButtonInteraction } from "discord.js"
import type { TrackScheduler } from "../../src/services/scheduler/TrackScheduler"

const mockGuildManagerGet = vi.hoisted(() => vi.fn())

vi.mock("@/services/guild/GuildManager", () => ({
  guildManager: {
    get: mockGuildManagerGet,
  },
}))

const { requireGuild, requirePlaying, requireSession } = await import("../../src/utils/guards")

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: "guild-1",
    user: { id: "user-1", username: "testuser" },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    options: { getString: vi.fn() },
    ...overrides,
  } as any as ChatInputCommandInteraction
}

function makeScheduler(overrides: Record<string, unknown> = {}): TrackScheduler {
  return {
    getCurrentTrack: vi.fn().mockReturnValue({ title: "Test" }),
    ...overrides,
  } as unknown as TrackScheduler
}

describe("guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("requireGuild", () => {
    it("retorna guildId si existe", () => {
      const interaction = makeInteraction()
      const result = requireGuild(interaction)

      expect(result).toBe("guild-1")
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it("retorna null y responde error si no hay guild", () => {
      const interaction = makeInteraction({ guildId: null })
      const result = requireGuild(interaction)

      expect(result).toBeNull()
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Este comando solo funciona en servidores",
        ephemeral: true,
      })
    })
  })

  describe("requirePlaying", () => {
    it("retorna session result si existe scheduler y tiene track actual", () => {
      const scheduler = makeScheduler()
      mockGuildManagerGet.mockReturnValue(scheduler)
      const interaction = makeInteraction()

      const result = requirePlaying(interaction)

      expect(result).not.toBeNull()
      expect(result!.scheduler).toBe(scheduler)
      expect(result!.guildId).toBe("guild-1")
    })

    it("retorna null si no hay guild", () => {
      const interaction = makeInteraction({ guildId: null })

      const result = requirePlaying(interaction)

      expect(result).toBeNull()
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Este comando solo funciona en servidores",
        ephemeral: true,
      })
    })

    it("retorna null si no hay scheduler", () => {
      mockGuildManagerGet.mockReturnValue(null)
      const interaction = makeInteraction()

      const result = requirePlaying(interaction)

      expect(result).toBeNull()
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "No hay nada reproduciéndose",
        ephemeral: true,
      })
    })

    it("retorna null si scheduler no tiene track actual", () => {
      const scheduler = makeScheduler({ getCurrentTrack: vi.fn().mockReturnValue(null) })
      mockGuildManagerGet.mockReturnValue(scheduler)
      const interaction = makeInteraction()

      const result = requirePlaying(interaction)

      expect(result).toBeNull()
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "No hay nada reproduciéndose",
        ephemeral: true,
      })
    })
  })

  describe("requireSession", () => {
    it("retorna session result si existe la sesión", () => {
      const scheduler = makeScheduler()
      mockGuildManagerGet.mockReturnValue(scheduler)
      const interaction = makeInteraction()

      const result = requireSession(interaction)

      expect(result).not.toBeNull()
      expect(result!.scheduler).toBe(scheduler)
      expect(result!.guildId).toBe("guild-1")
    })

    it("retorna null si no hay guild", () => {
      const interaction = makeInteraction({ guildId: null })

      const result = requireSession(interaction)

      expect(result).toBeNull()
    })

    it("retorna null si no hay sesión", () => {
      mockGuildManagerGet.mockReturnValue(null)
      const interaction = makeInteraction()

      const result = requireSession(interaction)

      expect(result).toBeNull()
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "No hay una sesión activa",
        ephemeral: true,
      })
    })
  })
})
