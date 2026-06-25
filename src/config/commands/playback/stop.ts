import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { requireSession } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  result.scheduler.stop()
  guildManager.delete(result.guildId)
  await silentReply(interaction)
}
