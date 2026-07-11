import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { requireSession } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  result.scheduler.destroy()
  await silentReply(interaction)
}
