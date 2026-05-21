import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { updateQueueForGuild, setQueuePage } from "../queue/queue"
import { replyTemporary, replyAndDelete } from "../../utils/messages"
import { requireQueue, requireSession } from "../../utils/guards"

export async function pause(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction)
  if (!queue) return
  if (queue.isPaused()) {
    await interaction.reply({ content: "Ya está pausado", ephemeral: true })
    return
  }
  queue.pause()
  await replyTemporary(interaction, "⏸ Pausado")
}

export async function resume(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction)
  if (!queue) return
  if (!queue.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }
  queue.resume()
  await replyTemporary(interaction, "▶ Reanudado")
}

export async function skip(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction)
  if (!queue) return
  queue.skip()
  setQueuePage(interaction.guildId!, 1)
  await replyAndDelete(interaction, "⏭ Saltado")
  await updateQueueForGuild(interaction.guildId!)
}

export async function stop(interaction: ChatInputCommandInteraction) {
  const queue = requireSession(interaction)
  if (!queue) return
  queue.stop()
  guildManager.delete(interaction.guildId!)
  guildManager.clearQueueMessage(interaction.guildId!)
  await replyAndDelete(interaction, "⏹ Detenido y cola limpiada")
}
