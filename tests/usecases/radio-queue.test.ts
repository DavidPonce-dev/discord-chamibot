import { describe, it, expect, vi } from "vitest"
import type { Mock } from "vitest"
import { createRadioUseCases } from "@/usecases/radio"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"
import type { Ports } from "@/domain/ports"
import type { RadioResult } from "@/domain/types"

const captureIdle = (ports: Ports): ((guildId: string) => void) =>
  (ports.player.onIdle as Mock).mock.calls[0][1] as (guildId: string) => void

const recommendation: RadioResult = {
  track: { title: "Radio Song", url: "https://youtube.com/watch?v=radio", duration: "3:00", id: "radio" },
  canonicalTitle: "Artist - Radio Song",
}

// One track per query, titled after the query
const searchByQuery = {
  ...createMockPorts().search,
  resolveQuery: async (query: string) => ({
    ok: true as const,
    value: { tracks: [{ url: `https://youtube.com/watch?v=${query}`, title: query, duration: "1:00", id: query }] },
  }),
} as Ports["search"]

const setup = (findRelated: () => Promise<RadioResult | null> = async () => recommendation) => {
  const recommend = { findRelated: vi.fn(findRelated) }
  const ports = createMockPorts({ search: searchByQuery, recommend })
  const music = createMusicUseCases(ports)
  const radio = createRadioUseCases(ports, music.getSession, music.setSession, music.prefetchNext)
  return { ports, music, radio, findRelated: recommend.findRelated }
}

// The radio only fills in when the users' queue has nothing left to play next
describe("usecases/radio with tracks in the queue", () => {
  it("no recomienda al activar la radio si hay temas en cola", async () => {
    const { music, radio, findRelated } = setup()
    await music.play("playing", "g1", "u1", "v1", {})
    await music.play("queued", "g1", "u1", "v1", {})

    const result = await radio.toggleAutoplay("g1")

    expect(result.ok).toBe(true)
    const session = music.getSession("g1")!
    expect(session.prefs.autoplay).toBe(true)
    expect(findRelated).not.toHaveBeenCalled()
    expect(session.queue.radioTracks).toHaveLength(0)
    expect(session.queue.userTracks.map(t => t.title)).toEqual(["queued"])
  })

  it("recomienda cuando la cola se queda sin temas con la radio activada", async () => {
    const { ports, music, radio, findRelated } = setup()
    await music.play("playing", "g1", "u1", "v1", {})
    await music.play("queued", "g1", "u1", "v1", {})
    await radio.toggleAutoplay("g1")

    // "playing" ends: "queued" starts and nothing is left after it
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.queue.current?.title).toBe("queued"))

    await vi.waitFor(() => expect(music.getSession("g1")!.queue.radioTracks.map(t => t.id)).toEqual(["radio"]))
    expect(findRelated).toHaveBeenCalledTimes(1)
  })

  it("sigue recomendando al activar la radio si no hay temas en cola", async () => {
    const { music, radio, findRelated } = setup()
    await music.play("playing", "g1", "u1", "v1", {})

    await radio.toggleAutoplay("g1")

    expect(findRelated).toHaveBeenCalledTimes(1)
    expect(music.getSession("g1")!.queue.radioTracks.map(t => t.id)).toEqual(["radio"])
  })

  it("descarta la recomendacion si alguien agrega un tema mientras se buscaba", async () => {
    let finish!: () => void
    const { music, radio } = setup(() => new Promise((resolve) => { finish = () => resolve(recommendation) }))
    await music.play("playing", "g1", "u1", "v1", {})

    const toggling = radio.toggleAutoplay("g1")
    await music.play("queued", "g1", "u2", "v1", {})
    finish()
    await toggling

    const session = music.getSession("g1")!
    expect(session.queue.userTracks.map(t => t.title)).toEqual(["queued"])
    expect(session.queue.radioTracks).toHaveLength(0)
  })

  it("descarta la recomendacion de fin de cola si alguien agrega un tema mientras se buscaba", async () => {
    let finish!: () => void
    const { ports, music } = setup(() => new Promise((resolve) => { finish = () => resolve(recommendation) }))
    await music.play("playing", "g1", "u1", "v1", {})
    const session = music.getSession("g1")!
    music.setSession("g1", { ...session, prefs: { ...session.prefs, autoplay: true } })
    await music.play("last", "g1", "u1", "v1", {})

    // "last" starts with nothing after it: the radio starts looking for a track
    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(music.getSession("g1")!.queue.current?.title).toBe("last"))
    await vi.waitFor(() => expect(finish).toBeDefined())
    await music.play("queued", "g1", "u2", "v1", {})
    finish()
    await new Promise((resolve) => setTimeout(resolve, 10))

    const after = music.getSession("g1")!
    expect(after.queue.userTracks.map(t => t.title)).toEqual(["queued"])
    expect(after.queue.radioTracks).toHaveLength(0)
  })
})
