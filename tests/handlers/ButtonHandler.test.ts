import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ButtonInteraction } from "discord.js"
import type { TrackScheduler } from "@/music/TrackScheduler"

const mockRequireGuild = vi.hoisted(() => vi.fn())
const mockRequireSession = vi.hoisted(() => vi.fn())
const mockRefreshQueueMessage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockToggleAutoplayPref = vi.hoisted(() => vi.fn().mockReturnValue(true))
const mockGetQueuePage = vi.hoisted(() => vi.fn().mockReturnValue(1))
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  event: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))
const mockGetErrorMessage = vi.hoisted(() => vi.fn((e) => e instanceof Error ? e.message : String(e)))
const mockLoopLabels = vi.hoisted(() => ({
  none: "Sin loop",
  one: "Loop uno",
  all: "Loop todos",
}))

vi.mock("@/utils/guards", () => ({
  requireGuild: mockRequireGuild,
  requireSession: mockRequireSession,
  requirePlaying: vi.fn(),
}))

vi.mock("@/music/QueueUIManager", () => ({
  refreshQueueMessage: mockRefreshQueueMessage,
}))

vi.mock("@/music/GuildManager", () => ({
  guildManager: {
    get: vi.fn(),
    toggleAutoplayPref: mockToggleAutoplayPref,
    getQueuePage: mockGetQueuePage,
    setQueuePage: vi.fn(),
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: mockLogger,
}))

vi.mock("@/utils/error", () => ({
  getErrorMessage: mockGetErrorMessage,
}))

vi.mock("@/config/ui", () => ({
  LOOP_LABELS: mockLoopLabels,
  BUTTON_PREFIXES: {
    queueUp: "q_up_",
    queueDown: "q_down_",
    queueDelete: "q_del_",
    queueTrack: "q_track_",
    queuePagePrev: "q_page_prev",
    queuePageNext: "q_page_next",
    queuePageIndicator: "q_page_indicator",
    queuePlaybackPause: "q_playback_pause",
    queuePlaybackSkip: "q_playback_skip",
    queuePlaybackShuffle: "q_playback_shuffle",
    queuePlaybackAutoplay: "q_playback_autoplay",
    queuePlaybackStop: "q_playback_stop",
    queueRadioShuffle: "q_radio_shuffle_",
  },
  EMBED_COLORS: {},
}))

vi.mock("@/config/timeouts", () => ({}))

function makeInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    guildId: "guild-1",
    user: { id: "user-1", username: "testuser" },
    customId: "q_playback_pause",
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    message: { delete: vi.fn().mockResolvedValue(undefined) },
    replied: false,
    deferred: false,
    ...overrides,
  } as any as ButtonInteraction
}

function makeScheduler(overrides: Partial<TrackScheduler> = {}): TrackScheduler {
  return {
    moveUp: vi.fn().mockReturnValue(true),
    moveDown: vi.fn().mockReturnValue(true),
    remove: vi.fn().mockReturnValue({ title: "Removed" }),
    togglePause: vi.fn(),
    skip: vi.fn(),
    shuffle: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
    toggleAutoplay: vi.fn().mockReturnValue(true),
    pause: vi.fn(),
    resume: vi.fn(),
    toggleLoop: vi.fn().mockReturnValue("one"),
    getPosition: vi.fn().mockReturnValue(30),
    seek: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TrackScheduler
}

describe("ButtonHandler", () => {
  let handleButton: (interaction: ButtonInteraction) => Promise<void>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireGuild.mockImplementation((interaction: any) => {
      if (!interaction.guildId) {
        interaction.reply({ content: "Este comando solo funciona en servidores", ephemeral: true }).catch(() => {})
        return null
      }
      return "guild-1"
    })
    mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler: makeScheduler() })
    mockRefreshQueueMessage.mockResolvedValue(undefined)
    mockGetQueuePage.mockReturnValue(1)

    const mod = await import("@/bot/ButtonHandler")
    handleButton = mod.handleButton
  })

  describe("sin guild", () => {
    it("requireSession retorna null sin guild → responde error y no continúa", async () => {
      mockRequireSession.mockImplementation((interaction: any) => {
        if (!interaction.guildId) {
          interaction.reply({ content: "Este comando solo funciona en servidores", ephemeral: true }).catch(() => {})
        }
        return null
      })
      const interaction = makeInteraction({ guildId: null })
      await handleButton(interaction)

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Este comando solo funciona en servidores",
        ephemeral: true,
      })
    })
  })

  describe("sin sesión", () => {
    it("requireSession retorna null → no hace nada", async () => {
      mockRequireSession.mockReturnValue(null)
      const interaction = makeInteraction()
      await handleButton(interaction)

      expect(mockRefreshQueueMessage).not.toHaveBeenCalled()
    })
  })

  describe("queue index actions", () => {
    it("q_up_N llama moveUp con el índice correcto", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_up_2" })
      await handleButton(interaction)

      expect(scheduler.moveUp).toHaveBeenCalledWith(2)
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })

    it("q_down_N llama moveDown con el índice correcto", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_down_5" })
      await handleButton(interaction)

      expect(scheduler.moveDown).toHaveBeenCalledWith(5)
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })

    it("q_del_N llama remove con el índice correcto", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_del_0" })
      await handleButton(interaction)

      expect(scheduler.remove).toHaveBeenCalledWith(0)
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })
  })

  describe("queue playback buttons", () => {
    it("q_playback_pause llama togglePause", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_pause" })
      await handleButton(interaction)

      expect(scheduler.togglePause).toHaveBeenCalled()
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })

    it("q_playback_skip llama skip con page 1", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_skip" })
      await handleButton(interaction)

      expect(scheduler.skip).toHaveBeenCalled()
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction, 1)
    })

    it("q_playback_shuffle llama shuffle", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_shuffle" })
      await handleButton(interaction)

      expect(scheduler.shuffle).toHaveBeenCalled()
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })

    it("q_playback_stop llama destroy", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_stop" })
      await handleButton(interaction)

      expect(scheduler.destroy).toHaveBeenCalled()
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })

    it("q_playback_autoplay llama toggleAutoplay y toggleAutoplayPref", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_autoplay" })
      await handleButton(interaction)

      expect(scheduler.toggleAutoplay).toHaveBeenCalled()
      expect(mockToggleAutoplayPref).toHaveBeenCalledWith("guild-1")
      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction)
    })
  })

  describe("queue navigation buttons", () => {
    it("q_page_prev llama con página anterior", async () => {
      mockGetQueuePage.mockReturnValue(3)
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_page_prev" })
      await handleButton(interaction)

      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction, 2)
    })

    it("q_page_prev en página 1 se queda en 1", async () => {
      mockGetQueuePage.mockReturnValue(1)
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_page_prev" })
      await handleButton(interaction)

      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction, 1)
    })

    it("q_page_next llama con página siguiente", async () => {
      mockGetQueuePage.mockReturnValue(2)
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_page_next" })
      await handleButton(interaction)

      expect(mockRefreshQueueMessage).toHaveBeenCalledWith(interaction, 3)
    })
  })

  describe("botón desconocido", () => {
    it("responde con acción no reconocida", async () => {
      const scheduler = makeScheduler()
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "unknown_action" })
      await handleButton(interaction)

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Acción no reconocida",
        ephemeral: true,
      })
    })
  })

  describe("error handling", () => {
    it("si una acción tira error → responde error message", async () => {
      const scheduler = makeScheduler({
        togglePause: vi.fn().mockImplementation(() => { throw new Error("boom") }),
      })
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({ customId: "q_playback_pause" })
      await handleButton(interaction)

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Error al ejecutar la acción",
        ephemeral: true,
      })
    })

    it("si acción tira error después de reply → usa editReply", async () => {
      const scheduler = makeScheduler({
        togglePause: vi.fn().mockImplementation(() => { throw new Error("boom") }),
      })
      mockRequireSession.mockReturnValue({ guildId: "guild-1", scheduler })
      const interaction = makeInteraction({
        customId: "q_playback_pause",
        replied: true,
      })
      await handleButton(interaction)

      expect(interaction.editReply).toHaveBeenCalledWith("Error al ejecutar la acción")
    })
  })
})
