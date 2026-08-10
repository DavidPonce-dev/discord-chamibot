import { describe, it, expect, vi } from "vitest"
import { createCommandHandlers } from "@/infra/discord/commands"
import type { MusicUseCases } from "@/usecases/music"
import type { QueueUseCases } from "@/usecases/queue"
import type { RadioUseCases } from "@/usecases/radio"
import type { AdminUseCases } from "@/usecases/admin"
import type { SearchUseCases } from "@/usecases/search"
import type { LoggerPort } from "@/domain/ports"
import { ok } from "@/shared/result"
import type { GuildSession } from "@/domain/types"

const mockLogger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

const createMockInteraction = (overrides: Record<string, any> = {}) => ({
  reply: vi.fn().mockResolvedValue(undefined),
  deferReply: vi.fn().mockResolvedValue(undefined),
  editReply: vi.fn().mockResolvedValue(undefined),
  deleteReply: vi.fn().mockResolvedValue(undefined),
  options: { getString: vi.fn().mockReturnValue("test query"), getInteger: vi.fn().mockReturnValue(1), getNumber: vi.fn().mockReturnValue(30) },
  guild: { members: { cache: { get: vi.fn().mockReturnValue({ voice: { channel: { id: "v1", guild: { voiceAdapterCreator: {} } } } }) } } },
  channel: { send: vi.fn().mockResolvedValue({}) },
  user: { id: "u1" },
  replied: false,
  deferred: false,
  ...overrides,
})

const createMockMusic = (overrides: Partial<MusicUseCases> = {}): MusicUseCases => ({
  play: vi.fn().mockResolvedValue(ok([{ title: "Track", url: "u", requestedBy: "u1" }])),
  skip: vi.fn().mockReturnValue(ok(undefined)),
  pause: vi.fn().mockReturnValue(ok(undefined)),
  resume: vi.fn().mockReturnValue(ok(undefined)),
  stop: vi.fn().mockReturnValue(ok(undefined)),
  seek: vi.fn().mockResolvedValue(ok(undefined)),
  getSession: vi.fn().mockReturnValue(null),
  getSessions: vi.fn().mockReturnValue(new Map()),
  startPlayback: vi.fn().mockResolvedValue(undefined),
  setSession: vi.fn(),
  destroySession: vi.fn(),
  isDeployMode: vi.fn().mockReturnValue(false),
  setDeployMode: vi.fn(),
  ...overrides,
})

const createMockQueue = (): QueueUseCases => ({
  getQueue: vi.fn().mockReturnValue(ok({ tracks: [], current: null, page: 1, session: {} })),
  shuffleQueue: vi.fn().mockReturnValue(ok(undefined)),
  removeTrack: vi.fn().mockReturnValue(ok({ title: "Removed", url: "u", requestedBy: "u1" })),
  moveUp: vi.fn().mockReturnValue(ok(undefined)),
  moveDown: vi.fn().mockReturnValue(ok(undefined)),
  toggleLoop: vi.fn().mockReturnValue(ok("one")),
})

const createMockRadio = (): RadioUseCases => ({
  toggleAutoplay: vi.fn().mockReturnValue(ok(true)),
  reshuffleRadio: vi.fn().mockResolvedValue(ok(null)),
})

const createMockAdmin = (): AdminUseCases => ({
  isDeployMode: vi.fn().mockReturnValue(false),
  toggleDeployMode: vi.fn().mockReturnValue({ deployMode: true, disconnectedGuilds: 0 }),
  leaveGuild: vi.fn().mockResolvedValue(ok("g1")),
  blacklistGuild: vi.fn().mockResolvedValue(ok("Server")),
  removeBlacklist: vi.fn().mockReturnValue(ok("g1")),
  getGuildsStatus: vi.fn().mockReturnValue([]),
  getBlacklist: vi.fn().mockReturnValue([]),
})

const createMockSearch = (): SearchUseCases => ({
  autocomplete: vi.fn().mockResolvedValue([]),
})

describe("infra/discord/commands", () => {
  const setup = () => {
    const music = createMockMusic()
    const queue = createMockQueue()
    const radio = createMockRadio()
    const admin = createMockAdmin()
    const search = createMockSearch()
    const updateUI = vi.fn()
    const initializeQueueDisplay = vi.fn().mockResolvedValue(undefined)
    const handlers = createCommandHandlers({ music, queue, radio, admin, search, updateUI, initializeQueueDisplay, logger: mockLogger })
    return { handlers, music, queue, radio, admin, updateUI, initializeQueueDisplay }
  }

  it("registers all command handlers", () => {
    const { handlers } = setup()
    expect(Object.keys(handlers)).toEqual(expect.arrayContaining(["p", "s", "pa", "r", "st", "q", "sh", "rm", "l", "sk", "np", "ap", "h", "lastfm"]))
  })

  it("/p defers and plays", async () => {
    const { handlers, music, updateUI, initializeQueueDisplay } = setup()
    const interaction = createMockInteraction()
    await handlers.p(interaction, "g1", "u1")
    expect(interaction.deferReply).toHaveBeenCalled()
    expect(music.play).toHaveBeenCalledWith("test query", "g1", "u1", "v1", expect.anything())
    expect(initializeQueueDisplay).toHaveBeenCalledWith("g1", expect.anything())
    expect(updateUI).toHaveBeenCalledWith("g1")
  })

  it("/p rejects when deploy mode", async () => {
    const admin = createMockAdmin()
    admin.isDeployMode = vi.fn().mockReturnValue(true)
    const handlers = createCommandHandlers({ music: createMockMusic(), queue: createMockQueue(), radio: createMockRadio(), admin, search: createMockSearch(), updateUI: vi.fn(), initializeQueueDisplay: vi.fn().mockResolvedValue(undefined), logger: mockLogger })
    const interaction = createMockInteraction()
    await handlers.p(interaction, "g1", "u1")
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Actualizando") }))
  })

  it("/p rejects when not in voice channel", async () => {
    const { handlers } = setup()
    const interaction = createMockInteraction({
      guild: { members: { cache: { get: vi.fn().mockReturnValue({ voice: { channel: null } }) } } },
    })
    await handlers.p(interaction, "g1", "u1")
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("canal de voz") }))
  })

  it("/s skips and updates UI", async () => {
    const { handlers, music, updateUI } = setup()
    music.getSession = vi.fn().mockReturnValue({ queue: { current: { title: "X" } } } as any)
    const interaction = createMockInteraction()
    await handlers.s(interaction, "g1", "u1")
    expect(music.skip).toHaveBeenCalledWith("g1")
    expect(updateUI).toHaveBeenCalledWith("g1")
  })

  it("/s rejects when nothing playing", async () => {
    const { handlers } = setup()
    const interaction = createMockInteraction()
    await handlers.s(interaction, "g1", "u1")
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("reproduciendose") }))
  })

  it("/pa pauses", async () => {
    const { handlers, music, updateUI } = setup()
    music.getSession = vi.fn().mockReturnValue({ queue: { current: { title: "X" } } } as any)
    const interaction = createMockInteraction()
    await handlers.pa(interaction, "g1", "u1")
    expect(music.pause).toHaveBeenCalledWith("g1")
    expect(updateUI).toHaveBeenCalled()
  })

  it("/h shows help embed", async () => {
    const { handlers } = setup()
    const interaction = createMockInteraction()
    await handlers.h(interaction, "g1", "u1")
    expect(interaction.reply).toHaveBeenCalled()
  })

  it("/lastfm set configures username", async () => {
    const { handlers, music } = setup()
    const session = { prefs: { lastfmUsername: null } } as any as GuildSession
    music.getSession = vi.fn().mockReturnValue(session)
    const interaction = createMockInteraction({
      options: { getString: vi.fn().mockImplementation((name: string) => name === "action" ? "set" : "myuser"), getInteger: vi.fn(), getNumber: vi.fn() },
    })
    await handlers.lastfm(interaction, "g1", "u1")
    expect(music.setSession).toHaveBeenCalled()
  })
})
