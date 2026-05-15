import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    return interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
  }

  queue.stop()
  musicManager.delete(interaction.guildId!)
  await interaction.reply("⏹ Detenido y cola limpiada")
}
