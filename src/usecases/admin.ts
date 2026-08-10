import type { Ports } from "../domain/ports"
import type { GuildInfo, GuildSession, BlacklistEntry } from "../domain/types"
import { ok, err, type Result } from "../shared/result"

export type DeployToggleResult = Readonly<{
  deployMode: boolean
  disconnectedGuilds: number
}>

export type AdminUseCases = Readonly<{
  isDeployMode: () => boolean
  toggleDeployMode: (sessions: Map<string, GuildSession>, destroySession: (guildId: string) => void) => DeployToggleResult
  leaveGuild: (guildId: string, destroySession: (guildId: string) => void) => Promise<Result<string, "bot_offline" | "guild_not_found">>
  blacklistGuild: (guildId: string, destroySession: (guildId: string) => void) => Promise<Result<string, "bot_offline">>
  removeBlacklist: (guildId: string) => Result<string, "not_found">
  getGuildsStatus: (sessions: Map<string, GuildSession>, getPosition: (s: GuildSession) => number) => readonly GuildInfo[]
  getBlacklist: () => readonly BlacklistEntry[]
}>

export const createAdminUseCases = (ports: Ports): AdminUseCases => {
  let deployMode = false

  const isDeployMode = (): boolean => deployMode

  const toggleDeployMode = (
    sessions: Map<string, GuildSession>,
    destroySession: (guildId: string) => void,
  ): DeployToggleResult => {
    if (deployMode) {
      deployMode = false
      return { deployMode: false, disconnectedGuilds: 0 }
    }

    deployMode = true
    let count = 0
    for (const guildId of sessions.keys()) {
      destroySession(guildId)
      count++
    }
    return { deployMode: true, disconnectedGuilds: count }
  }

  const leaveGuild = async (
    guildId: string,
    destroySession: (guildId: string) => void,
  ): Promise<Result<string, "bot_offline" | "guild_not_found">> => {
    destroySession(guildId)
    const result = await ports.guilds.leave(guildId)
    if (!result.ok) return err("guild_not_found")
    return ok(guildId)
  }

  const blacklistGuild = async (
    guildId: string,
    destroySession: (guildId: string) => void,
  ): Promise<Result<string, "bot_offline">> => {
    const guildInfos = ports.guilds.list()
    const info = guildInfos.find(g => g.id === guildId)
    ports.blacklist.add(guildId, info?.name ?? guildId)
    destroySession(guildId)
    await ports.guilds.leave(guildId)
    return ok(info?.name ?? guildId)
  }

  const removeBlacklist = (guildId: string): Result<string, "not_found"> => {
    const removed = ports.blacklist.remove(guildId)
    return removed ? ok(guildId) : err("not_found")
  }

  const getGuildsStatus = (
    sessions: Map<string, GuildSession>,
    getPosition: (s: GuildSession) => number,
  ): readonly GuildInfo[] => {
    const guildInfos = ports.guilds.list()
    return guildInfos.map(info => {
      const session = sessions.get(info.id)
      const music = session ? {
        connected: true,
        voiceChannel: session.voiceChannelId
          ? ports.guilds.voiceChannelName(info.id, session.voiceChannelId)
          : null,
        currentTrack: session.queue.current ? {
          title: session.queue.current.title,
          url: session.queue.current.url,
          requestedBy: session.queue.current.requestedBy,
          duration: session.queue.current.duration ?? null,
          position: getPosition(session),
        } : null,
        queueSize: session.queue.userTracks.length + session.queue.radioTracks.length,
        isPaused: session.playback.isPaused,
        autoplay: session.prefs.autoplay,
        loopMode: session.queue.loopMode,
      } : { connected: false }

      return {
        ...info,
        blacklisted: ports.blacklist.isBlacklisted(info.id),
        music,
      }
    })
  }

  const getBlacklist = (): readonly BlacklistEntry[] => ports.blacklist.getAll()

  return {
    isDeployMode,
    toggleDeployMode,
    leaveGuild,
    blacklistGuild,
    removeBlacklist,
    getGuildsStatus,
    getBlacklist,
  } as const
}
