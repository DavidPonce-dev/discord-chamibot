import { describe, it, expect, vi, afterEach } from "vitest"
import { createDiscordNotifier, createQueueMessageStore } from "@/infra/discord/messages"
import { createQueueDisplay } from "@/infra/ui/queue-display"
import { createSession } from "@/domain/session"
import type { GuildSession, Track } from "@/domain/types"
import type { LoggerPort } from "@/domain/ports"
import type { MusicUseCases } from "@/usecases/music"
import { BUTTON_PREFIXES } from "@/config/ui"

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

const flush = () => new Promise((r) => setTimeout(r, 0))

const pageIndicator = (payload: any): string | undefined => {
  for (const row of payload.components) {
    for (const c of row.toJSON().components) {
      if (c.custom_id === BUTTON_PREFIXES.queuePageIndicator) return c.label
    }
  }
  return undefined
}

describe("infra/ui/queue-display", () => {
  afterEach(() => { vi.useRealTimers() })

  describe("initializeQueueDisplay", () => {
    it("envia el reproductor en el primer /p", async () => {
      const { display } = setup()
      const channel = makeChannel()
      await display.initializeQueueDisplay("g1", channel as any)
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1))
    })

    it("no duplica el mensaje si se renderiza varias veces seguidas", async () => {
      const { display } = setup()
      const channel = makeChannel()
      await display.initializeQueueDisplay("g1", channel as any)
      display.updateQueueForGuild("g1")
      display.updateQueueForGuild("g1")
      await flush()
      await flush()
      expect(channel.send).toHaveBeenCalledTimes(1)
    })

    it("mueve el reproductor al canal del ultimo /p", async () => {
      const { display } = setup()
      const first = makeChannel("c1")
      const second = makeChannel("c2")
      await display.initializeQueueDisplay("g1", first as any)
      await vi.waitFor(() => expect(first.send).toHaveBeenCalledTimes(1))

      await display.initializeQueueDisplay("g1", second as any)
      await vi.waitFor(() => expect(second.send).toHaveBeenCalledTimes(1))
      expect(first.sent[0].delete).toHaveBeenCalled()
    })
  })

  describe("paginacion", () => {
    it("acota la pagina cuando la cola se achica", async () => {
      // 6 tracks with 3 per page = 2 pages, but the stored page is still 3
      const { display } = setup(withTracks(6, { queuePage: 3 }))
      const channel = makeChannel()
      await display.initializeQueueDisplay("g1", channel as any)
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalled())
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

    it("edita el reproductor con el estado actual a traves del notifier", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalled())
      const player = channel.sent[0]

      const session = ctx.getSession()!
      ctx.setSessionState({ ...session, playback: { ...session.playback, isPaused: true } })
      const interaction = makeButtonInteraction(player, channel)
      await ctx.display.refreshButtonMessage(interaction as any)

      await vi.waitFor(() => expect(player.edit).toHaveBeenCalled())
      expect(interaction.editReply).not.toHaveBeenCalled()
      const lastPayload = player.edit.mock.calls.at(-1)![0] as any
      const pauseBtn = lastPayload.components.at(-1).toJSON().components[0]
      expect(pauseBtn.emoji.name).toBe("▶")
    })

    it("guarda la pagina acotada", async () => {
      const ctx = setup(withTracks(6))
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalled())

      await ctx.display.refreshButtonMessage(makeButtonInteraction(channel.sent[0], channel) as any, 9)
      expect(ctx.getSession()!.queuePage).toBe(2)
    })

    it("borra un reproductor viejo que no es el actual", async () => {
      const ctx = setup()
      const channel = makeChannel()
      await ctx.display.initializeQueueDisplay("g1", channel as any)
      await vi.waitFor(() => expect(channel.send).toHaveBeenCalled())

      const orphan = makeMessage("c1", {})
      await ctx.display.refreshButtonMessage(makeButtonInteraction(orphan, channel) as any)
      expect(orphan.delete).toHaveBeenCalled()
      expect(channel.sent[0].delete).not.toHaveBeenCalled()
    })

    it("adopta el mensaje del boton si no hay reproductor registrado", async () => {
      const ctx = setup()
      const channel = makeChannel()
      const message = makeMessage("c1", {})
      await ctx.display.refreshButtonMessage(makeButtonInteraction(message, channel) as any)
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled())
      expect(channel.send).not.toHaveBeenCalled()
    })

    it("no borra el reproductor mientras la radio busca el siguiente tema", async () => {
      const ctx = setup(createSession("g1", "v1"))
      const channel = makeChannel()
      const player = makeMessage("c1", {})
      ctx.store.messages.set("g1", player as any)
      ctx.store.channels.set("g1", channel as any)

      await ctx.display.refreshButtonMessage(makeButtonInteraction(player, channel) as any)
      await flush()
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

  it("arma el contenido al ejecutar la edicion, no al encolarla", async () => {
    const { store, notifier, channel } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)

    let release!: () => void
    player.edit.mockImplementationOnce(() => new Promise<void>((r) => { release = r }))
    let state = "a"
    notifier.renderQueue("g1", () => ({ embeds: [state], components: [] }))
    await flush()
    notifier.renderQueue("g1", () => ({ embeds: [state], components: [] }))
    state = "b"
    release()

    await vi.waitFor(() => expect(player.edit).toHaveBeenCalledTimes(2))
    expect(player.edit.mock.calls[1][0].embeds).toEqual(["b"])
    expect(channel.send).not.toHaveBeenCalled()
  })

  it("no edita si el contenido no cambio", async () => {
    const { store, notifier } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)
    const build = () => ({ embeds: ["same"], components: [] })

    notifier.renderQueue("g1", build)
    await vi.waitFor(() => expect(player.edit).toHaveBeenCalledTimes(1))
    notifier.renderQueue("g1", build)
    await flush()
    await flush()
    expect(player.edit).toHaveBeenCalledTimes(1)
  })

  it("recrea el mensaje si un usuario lo borro", async () => {
    const { store, notifier, channel } = setupNotifier()
    const player = makeMessage("c1", {})
    player.edit.mockRejectedValueOnce(new Error("Unknown Message"))
    store.messages.set("g1", player as any)

    notifier.renderQueue("g1", () => ({ embeds: ["x"], components: [] }))
    await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1))
    expect(store.messages.get("g1")).toBe(channel.sent[0])
  })

  it("no revive el reproductor si la sesion se cerro durante una edicion", async () => {
    const { store, notifier, channel } = setupNotifier()
    const player = makeMessage("c1", {})
    store.messages.set("g1", player as any)

    let reject!: (e: Error) => void
    player.edit.mockImplementationOnce(() => new Promise((_r, rj) => { reject = rj }))
    notifier.renderQueue("g1", () => ({ embeds: ["x"], components: [] }))
    await flush()

    await notifier.deleteMessage("g1")
    reject(new Error("Unknown Message"))
    await flush()
    await flush()

    expect(channel.send).not.toHaveBeenCalled()
    expect(store.messages.get("g1")).toBeUndefined()
  })

  it("loguea cuando no puede enviar el mensaje", async () => {
    const { notifier, channel } = setupNotifier()
    channel.send.mockRejectedValueOnce(new Error("Missing Permissions"))
    notifier.renderQueue("g1", () => ({ embeds: ["x"], components: [] }))
    await vi.waitFor(() => expect(mockLogger.warn).toHaveBeenCalledWith("notify", expect.any(String), expect.objectContaining({ guildId: "g1" })))
  })
})
