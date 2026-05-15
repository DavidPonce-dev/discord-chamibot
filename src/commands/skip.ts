import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    return interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
  }

  if (!queue.getCurrentTrack()) {
    return interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
  }

  queue.skip()
  await interaction.reply("⏭ Saltado")
}
