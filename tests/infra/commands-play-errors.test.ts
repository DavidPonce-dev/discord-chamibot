import { describe, it, expect, vi } from "vitest"
import { createCommandHandlers } from "@/infra/discord/commands"
import type { MusicUseCases } from "@/usecases/music"
import type { QueueUseCases } from "@/usecases/queue"
import type { RadioUseCases } from "@/usecases/radio"
import type { AdminUseCases } from "@/usecases/admin"
import type { SearchUseCases } from "@/usecases/search"
import type { LoggerPort } from "@/domain/ports"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

const runPlay = async (error: string): Promise<string> => {
  const music = { play: vi.fn().mockResolvedValue({ ok: false, error }) } as unknown as MusicUseCases
  const handlers = createCommandHandlers({
    music,
    queue: {} as QueueUseCases,
    radio: {} as RadioUseCases,
    admin: { isDeployMode: () => false } as unknown as AdminUseCases,
    search: {} as SearchUseCases,
    updateUI: vi.fn(),
    initializeQueueDisplay: vi.fn().mockResolvedValue(undefined),
    logger,
  })
  const interaction = {
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: vi.fn().mockReturnValue("test query") },
    guild: { members: { cache: { get: vi.fn().mockReturnValue({ voice: { channel: { id: "v1", guild: { voiceAdapterCreator: {} } } } }) } } },
    channel: {},
    user: { id: "u1" },
  }
  await handlers.p(interaction as never, "g1", "u1")
  return interaction.editReply.mock.calls[0][0] as string
}

// Every failure used to read "Error al procesar el tema", whatever went wrong
describe("infra/discord/commands /p errors", () => {
  it("says when nothing was found", async () => {
    expect(await runPlay("not_found")).toContain("No encontre")
  })

  it("says when it could not join the voice channel", async () => {
    expect(await runPlay("voice_join_failed")).toContain("canal de voz")
  })

  it("says when the bot is being updated", async () => {
    expect(await runPlay("deploying")).toContain("Actualizando")
  })

  it("says when the session ended while the track was being added", async () => {
    expect(await runPlay("no_session")).toContain("sesion")
  })
})
