import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ChatInputCommandInteraction, Guild, VoiceChannel } from "discord.js"

const mockResolveQuery = vi.hoisted(() => vi.fn())
const mockGuildManagerGet = vi.hoisted(() => vi.fn())
const mockGuildManagerCreate = vi.hoisted(() => vi.fn())
const mockRequireGuild = vi.hoisted(() => vi.fn())
const mockEditTemporary = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  event: vi.fn(),
  info: vi.fn(),
}))
const mockJoinVoiceChannel = vi.hoisted(() => vi.fn())
const mockSetupSchedulerCallbacks = vi.hoisted(() => vi.fn())
const mockInitializeQueueDisplay = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockUpdateQueueForGuild = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockSetQueuePage = vi.hoisted(() => vi.fn())
const mockCalcTotalPages = vi.hoisted(() => vi.fn().mockReturnValue(1))

vi.mock("@/services/search/YouTubeResolver", () => ({
  resolveQuery: mockResolveQuery,
}))

vi.mock("@/services/guild/GuildManager", () => ({
  guildManager: {
    get: mockGuildManagerGet,
    create: mockGuildManagerCreate,
  },
}))

vi.mock("@/utils/guards", () => ({
  requireGuild: mockRequireGuild,
}))

vi.mock("@/utils/messages", () => ({
  editTemporary: mockEditTemporary,
}))

vi.mock("@/utils/logger", () => ({
  logger: mockLogger,
}))

vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: mockJoinVoiceChannel,
}))

vi.mock("@/services/queue/QueueProgressTracker", () => ({
  setupSchedulerCallbacks: mockSetupSchedulerCallbacks,
  initializeQueueDisplay: mockInitializeQueueDisplay,
}))

vi.mock("@/services/queue/QueueUIManager", () => ({
  updateQueueForGuild: mockUpdateQueueForGuild,
  setQueuePage: mockSetQueuePage,
}))

vi.mock("@/utils/format", () => ({
  calcTotalPages: mockCalcTotalPages,
}))

const { execute } = await import("@/commands/music/play")

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  const voiceChannel = makeVoiceChannel()
  const base = {
    guildId: "guild-1",
    user: { id: "user-1", username: "testuser" },
    options: { getString: vi.fn().mockReturnValue("test query") },
    guild: {
      members: { cache: { get: vi.fn().mockReturnValue({ voice: { channel: voiceChannel } }) } },
      voiceAdapterCreator: {},
      id: "guild-1",
    },
    channel: { send: vi.fn() },
    deferReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
  }
  return { ...base, ...overrides } as any as ChatInputCommandInteraction
}

function makeVoiceChannel(overrides: Record<string, unknown> = {}): VoiceChannel {
  return {
    id: "voice-1",
    name: "General",
    guild: { id: "guild-1", voiceAdapterCreator: {} },
    ...overrides,
  } as any as VoiceChannel
}

function makeScheduler(overrides: Record<string, unknown> = {}) {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    addMultiple: vi.fn().mockResolvedValue(undefined),
    getSize: vi.fn().mockReturnValue(0),
    onTrackChange: undefined,
    onDisconnect: undefined,
    ...overrides,
  }
}

describe("play command", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireGuild.mockReturnValue("guild-1")
    mockGuildManagerGet.mockReturnValue(null)
    mockGuildManagerCreate.mockReturnValue(makeScheduler())
    mockResolveQuery.mockResolvedValue({
      tracks: [{ url: "https://youtube.com/watch?v=test", title: "Test Song", duration: "3:30", id: "test" }],
    })
    mockJoinVoiceChannel.mockReturnValue({})
  })

  describe("validación de guild", () => {
    it("sin guild → responde error", async () => {
      mockRequireGuild.mockImplementation((interaction: any) => {
        interaction.reply({ content: "Este comando solo funciona en servidores", ephemeral: true }).catch(() => {})
        return null
      })
      const interaction = makeInteraction()

      await execute(interaction)

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Este comando solo funciona en servidores",
        ephemeral: true,
      })
    })
  })

  describe("validación de voz", () => {
    it("sin canal de voz → responde error", async () => {
      const member = { voice: { channel: null } }
      const interaction = makeInteraction({
        guild: {
          members: { cache: { get: vi.fn().mockReturnValue(member) } },
          voiceAdapterCreator: {},
          id: "guild-1",
        },
      })

      await execute(interaction)

      expect(interaction.reply).toHaveBeenCalledWith({
        content: "Debés entrar a un canal de voz",
        ephemeral: true,
      })
    })
  })

  describe("single track", () => {
    it("resuelve query y añade track al scheduler", async () => {
      const scheduler = makeScheduler()
      mockGuildManagerGet.mockReturnValue(scheduler)
      const interaction = makeInteraction()

      await execute(interaction)

      expect(mockResolveQuery).toHaveBeenCalledWith("test query")
      expect(scheduler.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test Song", url: "https://youtube.com/watch?v=test" })
      )
      expect(mockInitializeQueueDisplay).toHaveBeenCalled()
      expect(interaction.deleteReply).toHaveBeenCalled()
    })

    it("sin scheduler existente → crea conexión de voz", async () => {
      const scheduler = makeScheduler()
      mockGuildManagerGet.mockReturnValueOnce(null).mockReturnValueOnce(scheduler)
      const voiceChannel = makeVoiceChannel()
      const interaction = makeInteraction({
        guild: {
          members: { cache: { get: vi.fn().mockReturnValue({ voice: { channel: voiceChannel } }) } },
          voiceAdapterCreator: {},
          id: "guild-1",
        },
      })

      await execute(interaction)

      expect(mockJoinVoiceChannel).toHaveBeenCalledWith({
        channelId: "voice-1",
        guildId: "guild-1",
        adapterCreator: {},
      })
      expect(mockGuildManagerCreate).toHaveBeenCalledWith("guild-1", expect.anything())
    })
  })

  describe("error handling", () => {
    it("error en resolveQuery → responde error", async () => {
      mockResolveQuery.mockRejectedValue(new Error("No results"))
      const interaction = makeInteraction()

      await execute(interaction)

      expect(mockEditTemporary).toHaveBeenCalledWith(interaction, "Error al procesar el tema")
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
