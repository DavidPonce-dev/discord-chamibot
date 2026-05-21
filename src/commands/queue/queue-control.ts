import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { updateQueueForGuild } from "./queue"
import { replyTemporary, replyAndDelete } from "../../utils/messages"
import { requireSession } from "../../utils/guards"
import { LOOP_LABELS } from "../../constants"

export async function remove(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const scheduler = requireSession(interaction)
  if (!scheduler) return

  const removed = scheduler.remove(position - 1)
  if (!removed) {
    await interaction.reply({ content: "Posición inválida", ephemeral: true })
    return
  }

  await interaction.reply(`Eliminado: **${removed.title}**`)
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}

export async function shuffle(interaction: ChatInputCommandInteraction) {
  const scheduler = guildManager.get(interaction.guildId!)
  if (!scheduler || scheduler.getSize() === 0) {
    await interaction.reply({ content: "La cola está vacía", ephemeral: true })
    return
  }
  scheduler.shuffle()
  await replyAndDelete(interaction, "🔀 Cola mezclada")
  await updateQueueForGuild(interaction.guildId!)
}

export async function loop(interaction: ChatInputCommandInteraction) {
  const scheduler = requireSession(interaction)
  if (!scheduler) return
  const mode = scheduler.toggleLoop()
  await replyTemporary(interaction, `Loop: ${LOOP_LABELS[mode]}`)
}
