import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    return await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    
  }

  if (!queue.getCurrentTrack()) {
    return await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
  }

  queue.skip()
  return await interaction.reply("⏭ Saltado")
}
