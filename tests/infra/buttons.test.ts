import { describe, it, expect, vi } from "vitest"
import { handleButton } from "@/infra/discord/buttons"
import type { MusicUseCases } from "@/usecases/music"
import type { QueueUseCases } from "@/usecases/queue"
import type { RadioUseCases } from "@/usecases/radio"
import { ok } from "@/shared/result"
import { BUTTON_PREFIXES } from "@/config/ui"

const createMockBundle = () => {
  const music: MusicUseCases = {
    play: vi.fn().mockResolvedValue(ok([])),
    skip: vi.fn().mockReturnValue(ok(undefined)),
    pause: vi.fn().mockReturnValue(ok(undefined)),
    resume: vi.fn().mockReturnValue(ok(undefined)),
    stop: vi.fn().mockReturnValue(ok(undefined)),
    seek: vi.fn().mockResolvedValue(ok(undefined)),
    getSession: vi.fn().mockReturnValue({ playback: { isPaused: false }, queue: { current: {}, userTracks: [], radioTracks: [] } }),
    getSessions: vi.fn().mockReturnValue(new Map()),
    startPlayback: vi.fn().mockResolvedValue(undefined),
    setSession: vi.fn(),
    destroySession: vi.fn(),
    isDeployMode: vi.fn().mockReturnValue(false),
    setDeployMode: vi.fn(),
  }
  const queue: QueueUseCases = {
    getQueue: vi.fn().mockReturnValue(ok({})),
    shuffleQueue: vi.fn().mockReturnValue(ok(undefined)),
    removeTrack: vi.fn().mockReturnValue(ok({ title: "X", url: "u", requestedBy: "u" })),
    moveUp: vi.fn().mockReturnValue(ok(undefined)),
    moveDown: vi.fn().mockReturnValue(ok(undefined)),
    toggleLoop: vi.fn().mockReturnValue(ok("one")),
  }
  const radio: RadioUseCases = {
    toggleAutoplay: vi.fn().mockReturnValue(ok(true)),
    reshuffleRadio: vi.fn().mockResolvedValue(ok(null)),
  }
  const refreshMessage = vi.fn().mockResolvedValue(undefined)
  return { music, queue, radio, refreshMessage }
}

const createMockInteraction = (customId: string, guildId = "g1") => ({
  customId,
  guildId,
  user: { username: "testuser" },
  reply: vi.fn().mockResolvedValue(undefined),
  deferUpdate: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  editReply: vi.fn().mockResolvedValue(undefined),
  channel: { messages: { fetch: vi.fn() } },
  message: { id: "msg1" },
  replied: false,
  deferred: false,
})

describe("infra/discord/buttons", () => {
  it("ignores when no guildId", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction("q_playback_pause", null as any)
    interaction.guildId = null
    await handleButton(interaction as any, bundle)
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it("handles pause button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackPause)
    await handleButton(interaction as any, bundle)
    expect(bundle.music.pause).toHaveBeenCalled()
    expect(bundle.refreshMessage).toHaveBeenCalled()
  })

  it("handles skip button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackSkip)
    await handleButton(interaction as any, bundle)
    expect(bundle.music.skip).toHaveBeenCalled()
    expect(bundle.refreshMessage).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it("handles shuffle button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackShuffle)
    await handleButton(interaction as any, bundle)
    expect(bundle.queue.shuffleQueue).toHaveBeenCalled()
  })

  it("handles stop button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackStop)
    await handleButton(interaction as any, bundle)
    expect(bundle.music.stop).toHaveBeenCalled()
  })

  it("handles autoplay toggle", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackAutoplay)
    await handleButton(interaction as any, bundle)
    expect(bundle.radio.toggleAutoplay).toHaveBeenCalled()
  })

  it("handles page navigation prev", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue({ queuePage: 3 } as any)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePagePrev)
    await handleButton(interaction as any, bundle)
    expect(bundle.refreshMessage).toHaveBeenCalledWith(expect.anything(), 2)
  })

  it("handles page navigation next", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue({ queuePage: 1 } as any)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePageNext)
    await handleButton(interaction as any, bundle)
    expect(bundle.refreshMessage).toHaveBeenCalledWith(expect.anything(), 2)
  })

  it("handles queue delete button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(`${BUTTON_PREFIXES.queueDelete}2`)
    await handleButton(interaction as any, bundle)
    expect(bundle.queue.removeTrack).toHaveBeenCalledWith("g1", 3)
  })

  it("handles queue move up", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(`${BUTTON_PREFIXES.queueUp}3`)
    await handleButton(interaction as any, bundle)
    expect(bundle.queue.moveUp).toHaveBeenCalledWith("g1", 3)
  })

  it("handles radio shuffle button", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(`${BUTTON_PREFIXES.queueRadioShuffle}5`)
    await handleButton(interaction as any, bundle)
    expect(bundle.radio.reshuffleRadio).toHaveBeenCalledWith("g1", 5)
  })

  it("defers the interaction to avoid timeout", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackPause)
    await handleButton(interaction as any, bundle)
    expect(interaction.deferUpdate).toHaveBeenCalled()
  })

  it("replies when no session", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue(null)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackPause)
    await handleButton(interaction as any, bundle)
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("sesion") }))
  })
})
