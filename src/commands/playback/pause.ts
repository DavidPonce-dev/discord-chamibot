import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { updateQueueForGuild } from "@/services/queue/QueueUIManager"
import { requireScheduler, requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (scheduler.isPaused()) {
    await interaction.reply({ content: "Ya está pausado", ephemeral: true })
    return
  }
  scheduler.pause()
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const guildId = requireGuild(interaction)
  if (guildId) await updateQueueForGuild(guildId)
}
