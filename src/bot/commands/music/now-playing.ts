import { ChatInputCommandInteraction } from "discord.js"
import type { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { buildNowPlayingEmbed } from "@/ui/embeds/NowPlayingEmbed"
import { buildNowPlayingButtons } from "@/ui/components/QueueComponents"
import { requirePlaying } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requirePlaying(interaction)
  if (!result) return

  const embed = buildNowPlayingEmbed(result.scheduler)
  const row = buildNowPlayingButtons(result.scheduler)

  await interaction.deferReply()
  const channel = interaction.channel as GuildTextBasedChannel | null
  const msg = await channel?.send({ embeds: [embed], components: [row] })
  await interaction.deleteReply().catch(() => {})
  if (msg) guildManager.setNowPlayingMessage(result.guildId, msg)
}
