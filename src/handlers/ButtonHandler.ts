import { ButtonInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { refreshQueueMessage, getQueuePage } from "../commands/queue"
import { logger } from "../utils/logger"

export async function handleButton(interaction: ButtonInteraction) {
  const guildId = interaction.guildId!
  const user = interaction.user.username
  const queue = guildManager.get(guildId)

  if (!queue) {
    logger.warn("button", "Botón sin sesión activa", { user, guildId, customId: interaction.customId })
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }

  try {
    if (interaction.customId.startsWith("q_up_")) {
      const idx = parseInt(interaction.customId.slice(5), 10)
      queue.moveUp(idx)
      logger.event("button", "Move up", { user, guildId, index: idx })
      await refreshQueueMessage(interaction)
      return
    }
    if (interaction.customId.startsWith("q_down_")) {
      const idx = parseInt(interaction.customId.slice(7), 10)
      queue.moveDown(idx)
      logger.event("button", "Move down", { user, guildId, index: idx })
      await refreshQueueMessage(interaction)
      return
    }
    if (interaction.customId.startsWith("q_del_")) {
      const idx = parseInt(interaction.customId.slice(6), 10)
      queue.remove(idx)
      logger.event("button", "Delete from queue", { user, guildId, index: idx })
      await refreshQueueMessage(interaction)
      return
    }

    switch (interaction.customId) {
      case "q_page_prev":
        logger.event("button", "Page prev", { user, guildId })
        await refreshQueueMessage(interaction, Math.max(1, (getQueuePage(guildId) || 1) - 1))
        break
      case "q_page_next":
        logger.event("button", "Page next", { user, guildId })
        await refreshQueueMessage(interaction, getQueuePage(guildId) + 1)
        break
      case "q_playback_pause":
        queue.togglePause()
        logger.event("button", "Pause/Resume toggle", { user, guildId })
        await refreshQueueMessage(interaction)
        break
      case "q_playback_skip":
        queue.skip()
        logger.event("button", "Skip", { user, guildId })
        await refreshQueueMessage(interaction, 1)
        break
      case "q_playback_shuffle":
        queue.shuffle()
        logger.event("button", "Shuffle", { user, guildId })
        await refreshQueueMessage(interaction)
        break
      case "q_playback_clear":
        queue.clear()
        logger.event("button", "Clear queue", { user, guildId })
        await refreshQueueMessage(interaction)
        break
      case "q_playback_autoplay":
        queue.toggleAutoplay()
        guildManager.toggleAutoplayPref(guildId)
        logger.event("button", "Autoplay toggle", { user, guildId })
        await refreshQueueMessage(interaction)
        break

      case "np_pause":
        queue.pause()
        logger.event("button", "Now Playing pause", { user, guildId })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "⏸ Pausado", ephemeral: true })
        break
      case "np_resume":
        queue.resume()
        logger.event("button", "Now Playing resume", { user, guildId })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "▶ Reanudado", ephemeral: true })
        break
      case "np_skip":
        queue.skip()
        logger.event("button", "Now Playing skip", { user, guildId })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "⏭ Saltado", ephemeral: true })
        break
      case "np_loop": {
        const mode = queue.toggleLoop()
        const labels: Record<string, string> = {
          none: "❌ Loop desactivado",
          one: "🔂 Repetir uno",
          all: "🔁 Repetir todo",
        }
        logger.event("button", "Now Playing loop", { user, guildId, mode })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: labels[mode], ephemeral: true })
        break
      }
      case "np_shuffle":
        queue.shuffle()
        logger.event("button", "Now Playing shuffle", { user, guildId })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "🔀 Cola mezclada", ephemeral: true })
        break
      case "np_seek_back": {
        const pos = Math.max(0, queue.getPosition() - 15)
        await queue.seek(pos)
        logger.event("button", "Now Playing seek back", { user, guildId, position: pos })
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "⏪ -15s", ephemeral: true })
        break
      }
      default:
        logger.warn("button", "Acción no reconocida", { user, guildId, customId: interaction.customId })
        await interaction.reply({ content: "Acción no reconocida", ephemeral: true })
        break
    }
  } catch (error) {
    logger.error("button", "Error en botón", {
      user,
      guildId,
      customId: interaction.customId,
      error: error instanceof Error ? error.message : String(error),
    })
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la acción")
      } else {
        await interaction.reply({ content: "Error al ejecutar la acción", ephemeral: true })
      }
    } catch { /* interaction might be expired */ }
  }
}
