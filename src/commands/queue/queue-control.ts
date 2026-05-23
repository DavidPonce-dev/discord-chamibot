import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { updateQueueForGuild } from "@/commands/queue/queue"
import { requireSession } from "@/utils/guards"

export async function remove(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const scheduler = requireSession(interaction)
  if (!scheduler) return

  const removed = scheduler.remove(position - 1)
  if (!removed) {
    await interaction.reply({ content: "Posición inválida", ephemeral: true })
    return
  }

  await interaction.deferReply()
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
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}

export async function loop(interaction: ChatInputCommandInteraction) {
  const scheduler = requireSession(interaction)
  if (!scheduler) return
  scheduler.toggleLoop()
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}
