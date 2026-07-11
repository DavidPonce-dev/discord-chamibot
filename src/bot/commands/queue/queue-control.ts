import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { updateQueueForGuild } from "@/music/QueueUIManager"
import { requireSession } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function remove(interaction: ChatInputCommandInteraction) {
  const position = interaction.options.getInteger("position", true)
  const result = requireSession(interaction)
  if (!result) return

  const removed = result.scheduler.remove(position - 1)
  if (!removed) {
    await interaction.reply({ content: "Posición inválida", ephemeral: true })
    return
  }

  await silentReply(interaction)
  updateQueueForGuild(result.guildId)
}

export async function shuffle(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  if (result.scheduler.getSize() === 0) {
    await interaction.reply({ content: "La cola está vacía", ephemeral: true })
    return
  }

  result.scheduler.shuffle()
  await silentReply(interaction)
  updateQueueForGuild(result.guildId)
}

export async function loop(interaction: ChatInputCommandInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  result.scheduler.toggleLoop()
  await silentReply(interaction)
  updateQueueForGuild(result.guildId)
}
