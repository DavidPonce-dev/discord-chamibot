import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createDiscordNotifier, createQueueMessageStore } from "@/infra/discord/messages"
import { createQueueDisplay } from "@/infra/ui/queue-display"
import { createSession } from "@/domain/session"
import type { GuildSession, Track } from "@/domain/types"
import type { LoggerPort } from "@/domain/ports"
import type { MusicUseCases } from "@/usecases/music"
import { BUTTON_PREFIXES } from "@/config/ui"
import { PROGRESS_UPDATE_INTERVAL_MS } from "@/config/timeouts"

const mockLogger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

type FakeMessage = {
  id: string
  channelId: string
  payload: any
  edit: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

let messageSeq = 0
const makeMessage = (channelId: string, payload: unknown): FakeMessage => {
  const msg: FakeMessage = {
    id: `m${++messageSeq}`,
    channelId,
    payload,
    edit: vi.fn(async (p: unknown) => { msg.payload = p; return msg }),
    delete: vi.fn(async () => {}),
  }
  return msg
}

const makeChannel = (id = "c1") => {
  const sent: FakeMessage[] = []
  const channel = {
    id,
    sent,
    send: vi.fn(async (payload: unknown) => {
      const msg = makeMessage(id, payload)
      sent.push(msg)
      return msg
    }),
  }
  return channel
}

const makeTrack = (n: number, overrides: Partial<Track> = {}): Track => ({
  title: `Artist - Song ${n}`,
  url: `https://youtube.com/watch?v=t${n}`,
  requestedBy: "user1",
  duration: "3:00",
  ...overrides,
})

const withTracks = (count: number, overrides: Partial<GuildSession> = {}): GuildSession => {
  const base = createSession("g1", "v1")
  return {
    ...base,
    queue: {
      ...base.queue,
      current: makeTrack(0),
      userTracks: Array.from({ length: count }, (_, i) => makeTrack(i + 1)),
    },
    ...overrides,
  }
}

const setup = (initial: GuildSession | null = withTracks(2)) => {
  let session = initial
  const music = {
    getSession: vi.fn(() => session),
    setSession: vi.fn((_guildId: string, s: GuildSession) => { session = s }),
  } as unknown as MusicUseCases
  const store = createQueueMessageStore()
  const notifier = createDiscordNotifier(store.messages, store.channels, mockLogger)
  const display = createQueueDisplay({ music, notifier, queueMessages: store.messages, queueChannels: store.channels, logger: mockLogger })
  return {
    music,
    store,
    notifier,
    display,
    getSession: () => session,
    setSessionState: (s: GuildSession | null) => { session = s },
  }
}

const tick = () => vi.advanceTimersByTimeAsync(PROGRESS_UPDATE_INTERVAL_MS)

const pageIndicator = (payload: any): string | undefined => {
  for (const row of payload.components) {
    for (const c of row.toJSON().components) {
      if (c.custom_id === BUTTON_PREFIXES.queuePageIndicator) return c.label
    }
  }
  return undefined
}

const pauseEmoji = (payload: any): string => payload.components.at(-1).toJSON().components[0].emoji.name

describe("infra/ui/queue-display", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  describe("initializeQueueDisplay", () => {
    it("envia el reproductor en el primer /p sin esperar al tick", async () => {
      const { display } = setup()
      const channel = makeChannel()
      await display.initializeQueueDisplay("g1", channel as any)
      expect(channel.send).toHaveBeenCalledTimes(1)
    })

    it("mueve el reproductor al canal del ultimo /p", async () => {
      const { display } = setup()
      const first = makeChannel("c1")
      const second = makeChannel("c2")
      await display.initializeQueueDisplay("g1", first as any)
      await display.initializeQueueDisplay("g1", second as any)
      expect(second.send).toHaveBeenCalledTimes(1)
      expect(first.sent[0].delete).toHaveBeenCalled()
    })
  })

  describe("loop de render", () => {
    it("muestra los cambios en el siguiente tick, no antes", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      const player = channel.sent[0]

      const session = ctx.getSession()!
      ctx.setSessionState({ ...session, playback: { ...session.playback, isPaused: true } })
      ctx.display.ensureRendering("g1")
      await vi.advanceTimersByTimeAsync(PROGRESS_UPDATE_INTERVAL_MS - 1)
      expect(player.edit).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(player.edit).toHaveBeenCalledTimes(1)
      expect(pauseEmoji(player.payload)).toBe("▶")
    })

    it("los eventos frecuentes no posponen el render", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      const player = channel.sent[0]
      const session = ctx.getSession()!
      ctx.setSessionState({ ...session, playback: { ...session.playback, isPaused: true } })

      // An event every second (track changes, buttons, radio): the loop must still fire at 5 s
      for (let i = 0; i < 5; i++) {
        ctx.display.ensureRendering("g1")
        await vi.advanceTimersByTimeAsync(1000)
      }
      expect(player.edit).toHaveBeenCalledTimes(1)
    })

    it("no edita si nada cambio", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      const session = ctx.getSession()!
      // Paused: the position doesn't move, so every tick renders the same content
      ctx.setSessionState({ ...session, playback: { ...session.playback, isPaused: true, playbackStart: null } })
      await tick()
      await tick()
      await tick()
      expect(channel.sent[0].edit).toHaveBeenCalledTimes(1)
    })

    it("se detiene cuando la sesion termina", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      ctx.setSessionState(null)
      await tick()
      expect(vi.getTimerCount()).toBe(0)
    })

    it("acota la pagina cuando la cola se achica", async () => {
      // 6 tracks with 3 per page = 2 pages, but the stored page is still 3
      const { display } = setup(withTracks(6, { queuePage: 3 }))
      const channel = makeChannel()
      await display.initializeQueueDisplay("g1", channel as any)
      expect(pageIndicator(channel.sent[0].payload)).toBe("2 / 2")
    })
  })

  describe("refreshButtonMessage", () => {
    const makeButtonInteraction = (message: FakeMessage, channel: ReturnType<typeof makeChannel>) => ({
      guildId: "g1",
      message,
      channel,
      editReply: vi.fn().mockResolvedValue(undefined),
    })

    it("no edita al instante: el cambio sale en el siguiente tick", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      const player = channel.sent[0]

      const session = ctx.getSession()!
      ctx.setSessionState({ ...session, playback: { ...session.playback, isPaused: true } })
      const interaction = makeButtonInteraction(player, channel)
      await ctx.display.refreshButtonMessage(interaction as any)
      expect(player.edit).not.toHaveBeenCalled()
      expect(interaction.editReply).not.toHaveBeenCalled()

      await tick()
      expect(pauseEmoji(player.payload)).toBe("▶")
    })

    it("guarda la pagina acotada", async () => {
      const ctx = setup(withTracks(6))
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)

      await ctx.display.refreshButtonMessage(makeButtonInteraction(channel.sent[0], channel) as any, 9)
      expect(ctx.getSession()!.queuePage).toBe(2)
    })

    it("borra un reproductor viejo que no es el actual", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)

      const orphan = makeMessage("c1", {})
      await ctx.display.refreshButtonMessage(makeButtonInteraction(orphan, channel) as any)
      expect(orphan.delete).toHaveBeenCalled()
      expect(channel.sent[0].delete).not.toHaveBeenCalled()
    })

    it("adopta el mensaje del boton si no hay reproductor registrado y arranca el loop", async () => {
      const ctx = setup()
      const channel = makeChannel()
      const message = makeMessage("c1", {})
      await ctx.display.refreshButtonMessage(makeButtonInteraction(message, channel) as any)
      await tick()
      expect(message.edit).toHaveBeenCalled()
      expect(channel.send).not.toHaveBeenCalled()
    })

    it("no borra el reproductor mientras la radio busca el siguiente tema", async () => {
      const ctx = setup(createSession("g1", "v1"))
      const channel = makeChannel()
      const player = makeMessage("c1", {})
      ctx.store.messages.set("g1", player as any)
      ctx.store.channels.set("g1", channel as any)

      await ctx.display.refreshButtonMessage(makeButtonInteraction(player, channel) as any)
      await tick()
      expect(player.delete).not.toHaveBeenCalled()
    })
  })
})

describe("infra/discord/messages (notifier)", () => {
  const setupNotifier = () => {
    const store = createQueueMessageStore()
    const notifier = createDiscordNotifier(store.messages, store.channels, mockLogger)
    const channel = makeChannel()
    store.channels.set("g1", channel as any)
    return { store, notifier, channel }
  }

  it("saltea el render si hay otro en curso, sin encolarlo", async () => {
    const { store, notifier } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)

    let release!: () => void
    player.edit.mockImplementationOnce(() => new Promise<void>((r) => { release = r }))
    const first = notifier.render("g1", () => ({ embeds: ["a"], components: [] }))
    const skippedBuild = vi.fn(() => ({ embeds: ["b"], components: [] }))
    await notifier.render("g1", skippedBuild)
    release()
    await first

    expect(skippedBuild).not.toHaveBeenCalled()
    expect(player.edit).toHaveBeenCalledTimes(1)
  })

  it("vuelve a renderizar cuando termina el render en curso", async () => {
    const { store, notifier } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)

    await notifier.render("g1", () => ({ embeds: ["a"], components: [] }))
    await notifier.render("g1", () => ({ embeds: ["b"], components: [] }))
    expect(player.edit).toHaveBeenCalledTimes(2)
  })

  it("no edita si el contenido no cambio", async () => {
    const { store, notifier } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)
    const build = () => ({ embeds: ["same"], components: [] })

    await notifier.render("g1", build)
    await notifier.render("g1", build)
    expect(player.edit).toHaveBeenCalledTimes(1)
  })

  it("recrea el mensaje si un usuario lo borro", async () => {
    const { store, notifier, channel } = setupNotifier()
    const player = makeMessage("c1", {})
    player.edit.mockRejectedValueOnce(new Error("Unknown Message"))
    store.messages.set("g1", player as any)

    await notifier.render("g1", () => ({ embeds: ["x"], components: [] }))
    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(store.messages.get("g1")).toBe(channel.sent[0])
  })

  it("no revive el reproductor si la sesion se cerro durante una edicion", async () => {
    const { store, notifier, channel } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)

    let reject!: (e: Error) => void
    player.edit.mockImplementationOnce(() => new Promise((_r, rj) => { reject = rj }))
    const rendering = notifier.render("g1", () => ({ embeds: ["x"], components: [] }))

    await notifier.deleteMessage("g1")
    reject(new Error("Unknown Message"))
    await rendering

    expect(channel.send).not.toHaveBeenCalled()
    expect(store.messages.get("g1")).toBeUndefined()
  })

  it("loguea cuando no puede enviar el mensaje", async () => {
    const { notifier, channel } = setupNotifier()
    channel.send.mockRejectedValueOnce(new Error("Missing Permissions"))
    await notifier.render("g1", () => ({ embeds: ["x"], components: [] }))
    expect(mockLogger.warn).toHaveBeenCalledWith("notify", expect.any(String), expect.objectContaining({ guildId: "g1" }))
  })
})
