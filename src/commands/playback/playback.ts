import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { updateQueueForGuild, setQueuePage } from "@/services/queue/QueueUIManager"
import { requireScheduler, requireSession, requireGuild } from "@/utils/guards"

export async function pause(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (scheduler.isPaused()) {
    await interaction.reply({ content: "Ya está pausado", ephemeral: true })
    return
  }
  scheduler.pause()
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const guildId = requireGuild(interaction)
  if (guildId) await updateQueueForGuild(guildId)
}

export async function resume(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  if (!scheduler.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }
  scheduler.resume()
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const guildId = requireGuild(interaction)
  if (guildId) await updateQueueForGuild(guildId)
}

export async function skip(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return
  scheduler.skip()
  const guildId = requireGuild(interaction)
  if (guildId) {
    setQueuePage(guildId, 1)
    await updateQueueForGuild(guildId)
  }
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
}

export async function stop(interaction: ChatInputCommandInteraction) {
  const session = requireSession(interaction)
  if (!session) return
  const guildId = requireGuild(interaction)
  if (!guildId) return
  session.stop()
  guildManager.delete(guildId)
  guildManager.clearQueueMessage(guildId)
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
}
