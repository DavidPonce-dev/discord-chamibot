import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { updateQueueForGuild } from "./queue"
import { replyTemporary, replyAndDelete } from "../utils/messages"
import { requireSession } from "../utils/guards"
import { LOOP_LABELS } from "../constants"

export async function remove(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const queue = requireSession(interaction)
  if (!queue) return

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
  await replyAndDelete(interaction, "🔀 Cola mezclada")
  await updateQueueForGuild(interaction.guildId!)
}

export async function loop(interaction: ChatInputCommandInteraction) {
  const queue = requireSession(interaction)
  if (!queue) return
  const mode = queue.toggleLoop()
  await replyTemporary(interaction, `Loop: ${LOOP_LABELS[mode]}`)
}
