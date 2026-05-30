import { ChatInputCommandInteraction } from "discord.js"
import { updateQueueForGuild } from "@/services/queue/QueueUIManager"
import { requireScheduler, requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (!scheduler.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }
  scheduler.resume()
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const guildId = requireGuild(interaction)
  if (guildId) await updateQueueForGuild(guildId)
}
