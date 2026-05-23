import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { buildNowPlayingEmbed } from "@/ui/embeds/NowPlayingEmbed"
import { buildNowPlayingButtons } from "@/ui/components/QueueComponents"
import { requireScheduler } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return

  const embed = buildNowPlayingEmbed(scheduler)
  const row = buildNowPlayingButtons(scheduler)

  await interaction.deferReply()
  const channel = interaction.channel as GuildTextBasedChannel | null
  const msg = await channel?.send({ embeds: [embed], components: [row] })
  await interaction.deleteReply().catch(() => {})
  if (msg) guildManager.setQueueMessage(interaction.guildId!, msg)
}
