import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  if (!queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  queue.skip()
  await interaction.reply("⏭ Saltado")
}
