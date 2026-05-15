import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || !queue.getCurrentTrack()) {
    return await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
  }

  if (!queue.isPaused()) {
    return await interaction.reply({ content: "No está pausado", ephemeral: true })
  }

  queue.resume()
  return await interaction.reply("▶ Reanudado")
}
