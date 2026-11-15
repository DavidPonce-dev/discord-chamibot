import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createVoiceWatcher } from "@/infra/discord/voice-watch"
import { createSession } from "@/domain/session"
import type { GuildSession } from "@/domain/types"
import type { LoggerPort } from "@/domain/ports"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

describe("infra/discord/voice-watch", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const setup = () => {
    let session: GuildSession | null = createSession("g1", "voice1")
    const music = {
      getSession: vi.fn((guildId: string) => (guildId === "g1" ? session : null)),
      setSession: vi.fn((_guildId: string, s: GuildSession) => { session = s }),
      destroySession: vi.fn(() => { session = null }),
    }
    const watcher = createVoiceWatcher({ music, logger })
    return { music, watcher, getSession: () => session }
  }

  it("termina la sesion cuando desconectan al bot del canal de voz", () => {
    const { music, watcher } = setup()
    watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: true, oldChannelId: "voice1", newChannelId: null })
    expect(music.destroySession).toHaveBeenCalledWith("g1")
  })

  it("sigue sonando aunque el canal quede sin oyentes", () => {
    const { music, watcher, getSession } = setup()
    watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: false, oldChannelId: "voice1", newChannelId: null })

    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(music.destroySession).not.toHaveBeenCalled()
    expect(getSession()).not.toBeNull()
  })

  it("ignora la desconexion del bot en servidores sin sesion", () => {
    const { music, watcher } = setup()
    watcher.onVoiceStateUpdate({ guildId: "g2", isSelf: true, oldChannelId: "voice1", newChannelId: null })
    expect(music.destroySession).not.toHaveBeenCalled()
  })

  it("sigue al bot cuando lo mueven de canal sin terminar la sesion", () => {
    const { music, watcher, getSession } = setup()
    watcher.onVoiceStateUpdate({ guildId: "g1", isSelf: true, oldChannelId: "voice1", newChannelId: "voice2" })

    expect(getSession()?.voiceChannelId).toBe("voice2")
    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(music.destroySession).not.toHaveBeenCalled()
  })
})
