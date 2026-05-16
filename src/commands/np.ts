import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { buildNowPlayingEmbed } from "../ui/NowPlayingEmbed"
import { buildNowPlayingButtons } from "../ui/QueueComponents"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)

  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  const embed = buildNowPlayingEmbed(queue)
  const row = buildNowPlayingButtons(queue)

  await interaction.reply({ embeds: [embed], components: [row] })
}
