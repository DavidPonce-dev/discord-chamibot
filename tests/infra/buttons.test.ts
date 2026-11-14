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
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }
  return { music, queue, radio, refreshMessage, logger }
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
  followUp: vi.fn().mockResolvedValue(undefined),
  message: { id: "msg1", delete: vi.fn().mockResolvedValue(undefined) },
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

  const sessionWithTracks = (count: number, queuePage: number) => ({
    queuePage,
    queue: {
      current: null,
      userTracks: Array.from({ length: count }, (_, i) => ({ title: `T${i}`, url: `u${i}`, requestedBy: "u1" })),
      radioTracks: [],
    },
  })

  it("handles page navigation prev", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue(sessionWithTracks(9, 3) as any)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePagePrev)
    await handleButton(interaction as any, bundle)
    expect(bundle.refreshMessage).toHaveBeenCalledWith(expect.anything(), 2)
  })

  it("page prev goes back from the visible page when the stored one is past the end", async () => {
    const bundle = createMockBundle()
    // 4 tracks = 2 pages, but the stored page is still 3 from before the queue shrank
    bundle.music.getSession = vi.fn().mockReturnValue(sessionWithTracks(4, 3) as any)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePagePrev)
    await handleButton(interaction as any, bundle)
    expect(bundle.refreshMessage).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it("handles page navigation next", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue(sessionWithTracks(6, 1) as any)
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

  it("removes the orphan player and tells the user when there is no session", async () => {
    const bundle = createMockBundle()
    bundle.music.getSession = vi.fn().mockReturnValue(null)
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackPause)
    await handleButton(interaction as any, bundle)
    expect(interaction.message.delete).toHaveBeenCalled()
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("sesion"), ephemeral: true }))
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  // The player can be up to one render tick behind the queue: a button built for one track
  // must not act on whatever track took its position in the meantime
  describe("track buttons bound to a track id", () => {
    const sessionWithIds = () => ({
      playback: { isPaused: false },
      queue: {
        current: null,
        userTracks: [{ title: "A", url: "ua", requestedBy: "u1", id: "aaa" }, { title: "B", url: "ub", requestedBy: "u1", id: "bbb" }],
        radioTracks: [{ title: "R", url: "ur", requestedBy: "radio", id: "rrr" }],
      },
    })

    it("acts when the track at that position is still the one on the button", async () => {
      const bundle = createMockBundle()
      bundle.music.getSession = vi.fn().mockReturnValue(sessionWithIds() as any)
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueDelete}1:bbb`) as any, bundle)
      expect(bundle.queue.removeTrack).toHaveBeenCalledWith("g1", 2)
    })

    it("does not delete another track when the queue moved since the player was drawn", async () => {
      const bundle = createMockBundle()
      bundle.music.getSession = vi.fn().mockReturnValue(sessionWithIds() as any)
      // The button was drawn for "aaa" at position 1, but "bbb" is there now
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueDelete}1:aaa`) as any, bundle)
      expect(bundle.queue.removeTrack).not.toHaveBeenCalled()
      expect(bundle.refreshMessage).toHaveBeenCalled()
    })

    it("does not move or reshuffle a different track either", async () => {
      const bundle = createMockBundle()
      bundle.music.getSession = vi.fn().mockReturnValue(sessionWithIds() as any)
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueUp}1:aaa`) as any, bundle)
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueDown}0:bbb`) as any, bundle)
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueRadioShuffle}2:old`) as any, bundle)
      expect(bundle.queue.moveUp).not.toHaveBeenCalled()
      expect(bundle.queue.moveDown).not.toHaveBeenCalled()
      expect(bundle.radio.reshuffleRadio).not.toHaveBeenCalled()
    })

    it("reshuffles the radio track when it is still the one on the button", async () => {
      const bundle = createMockBundle()
      bundle.music.getSession = vi.fn().mockReturnValue(sessionWithIds() as any)
      await handleButton(createMockInteraction(`${BUTTON_PREFIXES.queueRadioShuffle}2:rrr`) as any, bundle)
      expect(bundle.radio.reshuffleRadio).toHaveBeenCalledWith("g1", 2)
    })
  })

  // After deferUpdate, editReply edits the player message itself: the error text stayed on it forever
  it("reports errors privately instead of writing them on the player", async () => {
    const bundle = createMockBundle()
    bundle.queue.shuffleQueue = vi.fn(() => { throw new Error("boom") })
    const interaction = createMockInteraction(BUTTON_PREFIXES.queuePlaybackShuffle)
    await handleButton(interaction as any, bundle)
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Error"), ephemeral: true }))
  })

  it("reports unknown buttons privately instead of writing on the player", async () => {
    const bundle = createMockBundle()
    const interaction = createMockInteraction("q_unknown_action")
    await handleButton(interaction as any, bundle)
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }))
  })
})
