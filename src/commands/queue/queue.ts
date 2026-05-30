import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { buildQueuePayloadForCommand } from "@/services/queue/QueueUIManager"
import { setQueuePage } from "@/services/queue/QueueUIManager"
import { requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const scheduler = guildManager.get(guildId)

  if (!scheduler || (scheduler.getSize() === 0 && !scheduler.getCurrentTrack())) {
    await interaction.deferReply()
    await interaction.deleteReply().catch(() => {})
    return
  }

  setQueuePage(guildId, 1)
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const channel = interaction.channel as GuildTextBasedChannel | null
  if (channel?.send) {
    const sent = await channel.send(buildQueuePayloadForCommand(scheduler, 1))
    guildManager.setQueueMessage(guildId, sent)
    guildManager.setQueueChannel(guildId, channel)
  }
}
