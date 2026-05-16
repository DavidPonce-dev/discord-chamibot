import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

const labels: Record<string, string> = {
  none: "❌ Desactivado",
  one: "🔂 Repetir uno",
  all: "🔁 Repetir todo",
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }

  const mode = queue.toggleLoop()
  await interaction.reply(`Loop: ${labels[mode]}`)
}
