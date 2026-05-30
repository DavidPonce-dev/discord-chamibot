import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { requireSession, requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const session = requireSession(interaction)
  if (!session) return
  const guildId = requireGuild(interaction)
  if (!guildId) return
  session.stop()
  guildManager.delete(guildId)
  guildManager.clearQueueMessage(guildId)
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
}
