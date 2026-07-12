import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { ensureQueueMessage } from "@/music/QueueUIManager"
import { requirePlaying } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requirePlaying(interaction)
  if (!result) return

  guildManager.setQueuePage(result.guildId, 1)
  await ensureQueueMessage(result.guildId, interaction.channel as GuildTextBasedChannel | undefined)
  await interaction.reply({ content: "Cola actualizada", ephemeral: true })
}
