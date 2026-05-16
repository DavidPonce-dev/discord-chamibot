import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"
import { updateQueueForGuild } from "./queue"

export async function execute(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }

  const removed = queue.remove(position - 1)

  if (!removed) {
    await interaction.reply({ content: "Posición inválida", ephemeral: true })
    return
  }

  await interaction.reply(`Eliminado: **${removed.title}**`)
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}
