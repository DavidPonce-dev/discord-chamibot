import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { updateQueueForGuild, setQueuePage } from "./queue"

export async function pause(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }
  if (queue.isPaused()) {
    await interaction.reply({ content: "Ya está pausado", ephemeral: true })
    return
  }
  queue.pause()
  await interaction.reply("⏸ Pausado")
}

export async function resume(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }
  if (!queue.isPaused()) {
    await interaction.reply({ content: "No está pausado", ephemeral: true })
    return
  }
  queue.resume()
  await interaction.reply("▶ Reanudado")
}

export async function skip(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }
  queue.skip()
  setQueuePage(interaction.guildId!, 1)
  await interaction.reply("⏭ Saltado")
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}

export async function stop(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue) {
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }
  queue.stop()
  guildManager.delete(interaction.guildId!)
  guildManager.clearQueueMessage(interaction.guildId!)
  await interaction.reply("⏹ Detenido y cola limpiada")
  await interaction.deleteReply().catch(() => {})
}
