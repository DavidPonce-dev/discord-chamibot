import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createVoiceWatcher } from "@/infra/discord/voice-watch"
import { createSession } from "@/domain/session"
import type { GuildSession } from "@/domain/types"
import type { LoggerPort } from "@/domain/ports"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }
const LEAVE_DELAY_MS = 60_000

describe("infra/discord/voice-watch", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const setup = (humans = 1) => {
    let session: GuildSession | null = createSession("g1", "voice1")
    const state = { humans }
    const music = {
      getSession: vi.fn((guildId: string) => (guildId === "g1" ? session : null)),
      setSession: vi.fn((_guildId: string, s: GuildSession) => { session = s }),
      destroySession: vi.fn(() => { session = null }),
    }
    const countHumans = vi.fn(() => state.humans)
    const watcher = createVoiceWatcher({ music, countHumans, logger, leaveDelayMs: LEAVE_DELAY_MS })
    const userLeaves = (channelId = "voice1") =>
      watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: false, oldChannelId: channelId, newChannelId: null })
    const userJoins = (channelId = "voice1") =>
      watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: false, oldChannelId: null, newChannelId: channelId })
    return { music, state, countHumans, watcher, userLeaves, userJoins, getSession: () => session }
  }

  it("termina la sesion cuando desconectan al bot del canal de voz", () => {
    const { music, watcher } = setup()
    watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: true, oldChannelId: "voice1", newChannelId: null })
    expect(music.destroySession).toHaveBeenCalledWith("g1")
  })

  it("se va cuando el canal queda sin oyentes durante el tiempo de gracia", () => {
    const { music, state, userLeaves } = setup()
    state.humans = 0
    userLeaves()

    vi.advanceTimersByTime(LEAVE_DELAY_MS - 1)
    expect(music.destroySession).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(music.destroySession).toHaveBeenCalledWith("g1")
  })

  it("se queda si alguien vuelve antes de que pase el tiempo de gracia", () => {
    const { music, state, userLeaves, userJoins } = setup()
    state.humans = 0
    userLeaves()
    vi.advanceTimersByTime(LEAVE_DELAY_MS / 2)
    state.humans = 1
    userJoins()

    vi.advanceTimersByTime(LEAVE_DELAY_MS * 2)
    expect(music.destroySession).not.toHaveBeenCalled()
  })

  it("se queda mientras haya alguien escuchando", () => {
    const { music, userLeaves } = setup(2)
    userLeaves()
    vi.advanceTimersByTime(LEAVE_DELAY_MS * 2)
    expect(music.destroySession).not.toHaveBeenCalled()
  })

  it("ignora movimientos en otros canales y en servidores sin sesion", () => {
    const { music, state, countHumans, watcher, userLeaves } = setup()
    state.humans = 0
    userLeaves("other-channel")
    watcher.onVoiceStateUpdate({ guildId: "g2", isSelf: false, oldChannelId: "voice1", newChannelId: null })

    vi.advanceTimersByTime(LEAVE_DELAY_MS * 2)
    expect(countHumans).not.toHaveBeenCalled()
    expect(music.destroySession).not.toHaveBeenCalled()
  })

  it("sigue al bot cuando lo mueven de canal y evalua el canal nuevo", () => {
    const { music, state, watcher, getSession } = setup()
    state.humans = 0
    watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: true, oldChannelId: "voice1", newChannelId: "voice2" })

    expect(getSession()?.voiceChannelId).toBe("voice2")
    vi.advanceTimersByTime(LEAVE_DELAY_MS)
    expect(music.destroySession).toHaveBeenCalledWith("g1")
  })

  it("no hace nada si la sesion ya termino cuando vence el tiempo de gracia", () => {
    const { music, state, userLeaves } = setup()
    state.humans = 0
    userLeaves()
    music.destroySession()
    music.destroySession.mockClear()

    vi.advanceTimersByTime(LEAVE_DELAY_MS)
    expect(music.destroySession).not.toHaveBeenCalled()
  })
})
