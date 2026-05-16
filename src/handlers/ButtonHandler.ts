import { ButtonInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { refreshQueueMessage, getQueuePage } from "../commands/queue"

export async function handleButton(interaction: ButtonInteraction) {
  const queue = guildManager.get(interaction.guildId!)
  if (!queue) {
    await interaction.reply({ content: "No hay una sesión activa", ephemeral: true })
    return
  }

  try {
    if (interaction.customId.startsWith("q_up_")) {
      const idx = parseInt(interaction.customId.slice(5), 10)
      queue.moveUp(idx)
      await refreshQueueMessage(interaction)
      return
    }
    if (interaction.customId.startsWith("q_down_")) {
      const idx = parseInt(interaction.customId.slice(7), 10)
      queue.moveDown(idx)
      await refreshQueueMessage(interaction)
      return
    }
    if (interaction.customId.startsWith("q_del_")) {
      const idx = parseInt(interaction.customId.slice(6), 10)
      queue.remove(idx)
      await refreshQueueMessage(interaction)
      return
    }

    switch (interaction.customId) {
      case "q_page_prev":
        await refreshQueueMessage(interaction, Math.max(1, (getQueuePage(interaction.guildId!) || 1) - 1))
        break
      case "q_page_next":
        await refreshQueueMessage(interaction, getQueuePage(interaction.guildId!) + 1)
        break
      case "q_playback_pause":
        queue.togglePause()
        await refreshQueueMessage(interaction)
        break
      case "q_playback_skip":
        queue.skip()
        await refreshQueueMessage(interaction, 1)
        break
      case "q_playback_shuffle":
        queue.shuffle()
        await refreshQueueMessage(interaction)
        break
      case "q_playback_clear":
        queue.clear()
        await refreshQueueMessage(interaction)
        break
      case "q_playback_autoplay":
        queue.toggleAutoplay()
        guildManager.toggleAutoplayPref(interaction.guildId!)
        await refreshQueueMessage(interaction)
        break

      case "np_pause":
        queue.pause()
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "⏸ Pausado", ephemeral: true })
        break
      case "np_resume":
        queue.resume()
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "▶ Reanudado", ephemeral: true })
        break
      case "np_skip":
        queue.skip()
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
        await interaction.update({ components: [] })
        await interaction.followUp({ content: labels[mode], ephemeral: true })
        break
      }
      case "np_shuffle":
        queue.shuffle()
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "🔀 Cola mezclada", ephemeral: true })
        break
      case "np_seek_back": {
        const pos = Math.max(0, queue.getPosition() - 15)
        await queue.seek(pos)
        await interaction.update({ components: [] })
        await interaction.followUp({ content: "⏪ -15s", ephemeral: true })
        break
      }
      default:
        await interaction.reply({ content: "Acción no reconocida", ephemeral: true })
        break
    }
  } catch (error) {
    console.error("Error en botón", error)
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la acción")
      } else {
        await interaction.reply({ content: "Error al ejecutar la acción", ephemeral: true })
      }
    } catch { /* interaction might be expired */ }
  }
}
