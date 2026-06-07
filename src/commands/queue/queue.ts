import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { buildQueuePayload, setQueuePage } from "@/services/queue/QueueUIManager"
import { requireSession } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  if (result.scheduler.getSize() === 0 && !result.scheduler.getCurrentTrack()) {
    await silentReply(interaction)
    return
  }

  setQueuePage(result.guildId, 1)
  await silentReply(interaction)
  const channel = interaction.channel as GuildTextBasedChannel | null
  if (channel?.send) {
    const sent = await channel.send(buildQueuePayload(result.scheduler, 1))
    guildManager.setQueueMessage(result.guildId, sent)
    guildManager.setQueueChannel(result.guildId, channel)
  }
}
