import { describe, it, expect, vi } from "vitest"
import type { Mock } from "vitest"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"
import type { Ports } from "@/domain/ports"
import { ok, err, type Result } from "@/shared/result"

const captureIdle = (ports: Ports): ((guildId: string) => void) =>
  (ports.player.onIdle as Mock).mock.calls[0][1] as (guildId: string) => void

// One track per query, titled after the query
const searchByQuery = {
  ...createMockPorts().search,
  resolveQuery: async (query: string) => ({
    ok: true as const,
    value: { tracks: [{ url: `https://youtube.com/watch?v=${query}`, title: query, duration: "1:00", id: query }] },
  }),
} as Ports["search"]

const twoTracks = {
  ...createMockPorts().search,
  resolveQuery: async () => ({ ok: true as const, value: { tracks: [
    { url: "u1", title: "First", duration: "1:00", id: "a" },
    { url: "u2", title: "Second", duration: "1:00", id: "b" },
  ] } }),
} as Ports["search"]

describe("usecases/music session creation", () => {
  it("libera la conexion de voz cuando no puede entrar al canal", async () => {
    const destroy = vi.fn()
    const ports = createMockPorts({
      voice: { join: async (): Promise<Result<void, string>> => err("timeout"), destroy },
    })
    const music = createMusicUseCases(ports)

    const result = await music.play("test", "g1", "u1", "v1", {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("voice_join_failed")
    expect(destroy).toHaveBeenCalledWith("g1")
    expect(music.getSession("g1")).toBeNull()
  })

  it("dos /p simultaneos sin sesion comparten la conexion y conservan ambos temas", async () => {
    let finishJoin!: () => void
    const join = vi.fn(() => new Promise<Result<void, string>>((resolve) => { finishJoin = () => resolve(ok(undefined)) }))
    const ports = createMockPorts({ search: searchByQuery, voice: { join, destroy: vi.fn() } })
    const music = createMusicUseCases(ports)

    const first = music.play("one", "g1", "u1", "v1", {})
    const second = music.play("two", "g1", "u2", "v1", {})
    await vi.waitFor(() => expect(join).toHaveBeenCalled())
    // Let the second /p reach the point where it looks for the session
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishJoin()
    await Promise.all([first, second])

    expect(join).toHaveBeenCalledTimes(1)
    expect(ports.player.onIdle).toHaveBeenCalledTimes(1)
    const session = music.getSession("g1")!
    const titles = [session.queue.current?.title, ...session.queue.userTracks.map(t => t.title)]
    expect(titles.sort()).toEqual(["one", "two"])
    expect(session.playback.isPlaying).toBe(true)
  })
})

describe("usecases/music skip with loop", () => {
  const withLoop = async (loopMode: "one" | "all") => {
    const ports = createMockPorts({ search: twoTracks })
    const music = createMusicUseCases(ports)
    await music.play("multi", "g1", "u1", "v1", {})
    const session = music.getSession("g1")!
    music.setSession("g1", { ...session, queue: { ...session.queue, loopMode } })
    return { ports, music }
  }

  it("repite el tema al terminar con loop 'one'", async () => {
    const { ports, music } = await withLoop("one")
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.playback.isPlaying).toBe(true))
    expect(music.getSession("g1")!.queue.current?.title).toBe("First")
  })

  it("skip pasa al siguiente tema aunque el loop sea 'one'", async () => {
    const { ports, music } = await withLoop("one")
    music.skip("g1")
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.queue.current?.title).toBe("Second"))
    expect(music.getSession("g1")!.queue.userTracks).toHaveLength(0)
  })

  it("despues de un skip el loop 'one' vuelve a repetir el tema nuevo", async () => {
    const { ports, music } = await withLoop("one")
    music.skip("g1")
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.queue.current?.title).toBe("Second"))

    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.playback.isPlaying).toBe(true))
    expect(music.getSession("g1")!.queue.current?.title).toBe("Second")
  })

  it("skip con loop 'all' manda el tema al final de la cola", async () => {
    const { ports, music } = await withLoop("all")
    music.skip("g1")
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.queue.current?.title).toBe("Second"))
    expect(music.getSession("g1")!.queue.userTracks.map(t => t.title)).toEqual(["First"])
  })
})
