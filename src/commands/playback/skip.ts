import { ChatInputCommandInteraction } from "discord.js"
import { updateQueueForGuild, setQueuePage } from "@/services/queue/QueueUIManager"
import { requireScheduler, requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  scheduler.skip()
  const guildId = requireGuild(interaction)
  if (guildId) {
    setQueuePage(guildId, 1)
    await updateQueueForGuild(guildId)
  }
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
}
