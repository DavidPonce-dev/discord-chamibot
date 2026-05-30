import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ChatInputCommandInteraction, Message } from "discord.js"

const mockReply = vi.hoisted(() => vi.fn())
const mockEditReply = vi.hoisted(() => vi.fn())
const mockDeleteReply = vi.hoisted(() => vi.fn())

vi.mock("@/config/timeouts", () => ({
  AUTO_DELETE_MS: 5000,
}))

const { replyTemporary, replyTemporaryEmbed, editTemporary, replyAndDelete } = await import("../../src/utils/messages")

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    reply: mockReply,
    editReply: mockEditReply,
    deleteReply: mockDeleteReply,
    replied: false,
    deferred: false,
    ...overrides,
  } as any as ChatInputCommandInteraction
}

describe("messages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("replyTemporary", () => {
    it("responde con contenido y programa borrado", async () => {
      const mockMsg = { delete: vi.fn().mockResolvedValue(undefined) }
      mockReply.mockResolvedValue(mockMsg)
      const interaction = makeInteraction()

      const result = await replyTemporary(interaction, "Hola")

      expect(mockReply).toHaveBeenCalledWith({ content: "Hola", fetchReply: true })
      expect(result).toBe(mockMsg)

      vi.advanceTimersByTime(5000)
      expect(mockMsg.delete).toHaveBeenCalled()
    })
  })

  describe("replyTemporaryEmbed", () => {
    it("responde con embeds y programa borrado", async () => {
      const mockMsg = { delete: vi.fn().mockResolvedValue(undefined) }
      mockReply.mockResolvedValue(mockMsg)
      const interaction = makeInteraction()
      const embeds = [{ toJSON: vi.fn() }] as any

      const result = await replyTemporaryEmbed(interaction, embeds)

      expect(mockReply).toHaveBeenCalledWith({ embeds, components: undefined, fetchReply: true })
      expect(result).toBe(mockMsg)

      vi.advanceTimersByTime(5000)
      expect(mockMsg.delete).toHaveBeenCalled()
    })

    it("acepta components opcionales", async () => {
      const mockMsg = { delete: vi.fn().mockResolvedValue(undefined) }
      mockReply.mockResolvedValue(mockMsg)
      const interaction = makeInteraction()
      const embeds = [{ toJSON: vi.fn() }] as any
      const components = [{ toJSON: vi.fn() }] as any

      await replyTemporaryEmbed(interaction, embeds, components)

      expect(mockReply).toHaveBeenCalledWith({ embeds, components, fetchReply: true })
    })
  })

  describe("editTemporary", () => {
    it("edita el reply y programa borrado", async () => {
      const mockMsg = { delete: vi.fn().mockResolvedValue(undefined) }
      mockEditReply.mockResolvedValue(mockMsg)
      const interaction = makeInteraction()

      const result = await editTemporary(interaction, "Error")

      expect(mockEditReply).toHaveBeenCalledWith({ content: "Error" })
      expect(result).toBe(mockMsg)

      vi.advanceTimersByTime(5000)
      expect(mockMsg.delete).toHaveBeenCalled()
    })
  })

  describe("replyAndDelete", () => {
    it("responde y borra el reply", async () => {
      mockReply.mockResolvedValue(undefined)
      mockDeleteReply.mockResolvedValue(undefined)
      const interaction = makeInteraction()

      await replyAndDelete(interaction, "Temp message")

      expect(mockReply).toHaveBeenCalledWith("Temp message")
      expect(mockDeleteReply).toHaveBeenCalled()
    })
  })
})
