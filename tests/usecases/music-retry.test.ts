import { describe, it, expect, vi } from "vitest"
import type { Mock } from "vitest"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"
import type { Ports } from "@/domain/ports"
import { err } from "@/shared/result"

const captureIdle = (ports: Ports): ((guildId: string) => void) =>
  (ports.player.onIdle as Mock).mock.calls[0][1] as (guildId: string) => void

describe("usecases/music play errors", () => {
  it("reporta 'not_found' cuando la busqueda no resuelve nada", async () => {
    const ports = createMockPorts({
      search: { ...createMockPorts().search, resolveQuery: async () => err("Sin resultados") } as Ports["search"],
    })
    const result = await createMusicUseCases(ports).play("zzz", "g1", "u1", "v1", {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("not_found")
  })
})

describe("usecases/music stream retry", () => {
  const setup = async () => {
    const createResource = vi.fn().mockResolvedValue({ ok: true as const, value: {} })
    const consumeStreamFailure = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    const ports = createMockPorts({
      audio: { ...createMockPorts().audio, createResource, consumeStreamFailure },
    } as Partial<Ports>)
    const music = createMusicUseCases(ports)
    await music.play("solo", "g1", "u1", "v1", {})
    return { ports, music, createResource }
  }

  // The stream URL expires or gets a 403 mid-track: restarting from 0:00 replays what was heard
  it("retoma el tema desde donde iba cuando el stream falla a mitad", async () => {
    const { ports, music, createResource } = await setup()
    const session = music.getSession("g1")!
    music.setSession("g1", { ...session, playback: { ...session.playback, playbackStart: Date.now() - 90_000 } })

    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(createResource).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(music.getSession("g1")!.playback.isPlaying).toBe(true))

    const seek = createResource.mock.calls[1][2] as number
    expect(seek).toBeGreaterThanOrEqual(89)
    expect(seek).toBeLessThanOrEqual(92)
    const elapsedMs = Date.now() - music.getSession("g1")!.playback.playbackStart!
    expect(elapsedMs).toBeGreaterThanOrEqual(89_000)
  })

  it("reinicia el tema si el stream falla apenas empieza", async () => {
    const { ports, music, createResource } = await setup()

    captureIdle(ports)("g1")
    await vi.waitFor(() => expect(createResource).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(music.getSession("g1")!.playback.isPlaying).toBe(true))
    expect(createResource.mock.calls[1][2]).toBeUndefined()
  })
})
