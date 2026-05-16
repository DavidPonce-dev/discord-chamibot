import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { updateQueueForGuild } from "./queue"

export async function remove(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const queue = guildManager.get(interaction.guildId!)

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

export async function shuffle(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue || queue.getSize() === 0) {
    await interaction.reply({ content: "La cola está vacía", ephemeral: true })
    return
  }
  queue.shuffle()
  await interaction.reply("🔀 Cola mezclada")
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}

const loopLabels: Record<string, string> = {
  none: "❌ Desactivado",
  one: "🔂 Repetir uno",
  all: "🔁 Repetir todo",
}

export async function loop(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue) {
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }
  const mode = queue.toggleLoop()
  await interaction.reply(`Loop: ${loopLabels[mode]}`)
}
