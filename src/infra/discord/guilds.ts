import type { Client } from "discord.js"
import type { GuildInfoPort } from "../../domain/ports"
import type { GuildInfo } from "../../domain/types"

export const createDiscordGuildAdapter = (getClient: () => Client | null): GuildInfoPort => {
  const list = (): readonly GuildInfo[] => {
    const client = getClient()
    if (!client) return []

    const guilds: GuildInfo[] = []
    for (const guild of client.guilds.cache.values()) {
      guilds.push({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        blacklisted: false,
        music: { connected: false },
      })
    }
    return guilds
  }

  const leave = async (guildId: string): Promise<{ ok: true; value: void } | { ok: false; error: string }> => {
    const client = getClient()
    if (!client) return { ok: false, error: "bot_offline" }

    const guild = client.guilds.cache.get(guildId)
    if (!guild) return { ok: false, error: "guild_not_found" }

    try {
      await guild.leave()
      return { ok: true, value: undefined }
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const voiceChannelName = (guildId: string, channelId: string): string | null => {
    const client = getClient()
    if (!client) return null
    const guild = client.guilds.cache.get(guildId)
    if (!guild) return null
    const channel = guild.channels.cache.get(channelId)
    return channel?.name ?? null
  }

  return { list, leave, voiceChannelName } as const
}
