import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const seconds = interaction.options.getNumber("seconds", true)
  const queue = guildManager.get(interaction.guildId!)

  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  await interaction.deferReply()

  try {
    await queue.seek(seconds)
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    await interaction.editReply(`⏩ Saltado a ${m}:${String(s).padStart(2, "0")}`)
  } catch {
    await interaction.editReply("Error al buscar")
  }
}
