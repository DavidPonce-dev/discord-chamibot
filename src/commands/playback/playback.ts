import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { updateQueueForGuild, setQueuePage } from "../queue/queue"
import { replyTemporary, replyAndDelete } from "../../utils/messages"
import { requireScheduler, requireSession } from "../../utils/guards"

export async function pause(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (scheduler.isPaused()) {
    await interaction.reply({ content: "Ya está pausado", ephemeral: true })
    return
  }
  scheduler.pause()
  await replyTemporary(interaction, "⏸ Pausado")
}

export async function resume(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (!scheduler.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }
  scheduler.resume()
  await replyTemporary(interaction, "▶ Reanudado")
}

export async function skip(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  scheduler.skip()
  setQueuePage(interaction.guildId!, 1)
  await replyAndDelete(interaction, "⏭ Saltado")
  await updateQueueForGuild(interaction.guildId!)
}

export async function stop(interaction: ChatInputCommandInteraction) {
  const session = requireSession(interaction)
  if (!session) return
  session.stop()
  guildManager.delete(interaction.guildId!)
  guildManager.clearQueueMessage(interaction.guildId!)
  await replyAndDelete(interaction, "⏹ Detenido y cola limpiada")
}
