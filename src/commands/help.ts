import { ChatInputCommandInteraction } from "discord.js"
import { buildHelpEmbed } from "../ui/HelpEmbed"

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = buildHelpEmbed()
  await interaction.reply({ embeds: [embed] })
}
