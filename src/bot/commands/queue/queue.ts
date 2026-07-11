import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { ensureQueueMessage } from "@/music/QueueUIManager"
import { guildManager } from "@/music/GuildManager"
import { requireSession } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  if (result.scheduler.getSize() === 0 && !result.scheduler.getCurrentTrack()) {
    await silentReply(interaction)
    return
  }

  guildManager.setQueuePage(result.guildId, 1)
  await silentReply(interaction)
  await ensureQueueMessage(result.guildId, interaction.channel as GuildTextBasedChannel | undefined)
}
