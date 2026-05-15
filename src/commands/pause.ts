import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || !queue.getCurrentTrack()) {
    return interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
  }

  if (queue.isPaused()) {
    return interaction.reply({ content: "Ya está pausado", ephemeral: true })
  }

  queue.pause()
  await interaction.reply("⏸ Pausado")
}
