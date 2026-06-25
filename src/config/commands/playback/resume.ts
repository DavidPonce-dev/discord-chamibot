import { ChatInputCommandInteraction } from "discord.js"
import { updateQueueForGuild } from "@/services/queue/QueueUIManager"
import { requirePlaying } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requirePlaying(interaction)
  if (!result) return

  if (!result.scheduler.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }

  result.scheduler.resume()
  await silentReply(interaction)
  await updateQueueForGuild(result.guildId)
}
