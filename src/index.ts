import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
} from "discord.js"
import dotenv from "dotenv"
import { execute as play } from "./commands/play"
import { execute as skip } from "./commands/skip"
import { execute as queue } from "./commands/queue"
import { execute as pause } from "./commands/pause"
import { execute as resume } from "./commands/resume"
import { execute as stop } from "./commands/stop"
import { execute as autoplay } from "./commands/autoplay"
import { execute as help } from "./commands/help"
import { execute as shuffle } from "./commands/shuffle"
import { execute as remove } from "./commands/remove"
import { execute as np } from "./commands/np"
import { execute as loop } from "./commands/loop"
import { execute as seek } from "./commands/seek"
import { refreshQueueMessage, getQueuePage } from "./commands/queue"
import { musicManager } from "./music/MusicManager"
import { autocompleteSearch } from "./utils/search"

process.on("unhandledRejection", () => {
  console.error("Error no manejado")
})

process.on("uncaughtException", () => {
  console.error("Error crítico")
  process.exit(1)
})

dotenv.config()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
})

const commands = new Map<string, (interaction: ChatInputCommandInteraction) => Promise<void>>()
commands.set("p", play)
commands.set("s", skip)
commands.set("q", queue)
commands.set("pa", pause)
commands.set("r", resume)
commands.set("st", stop)
commands.set("ap", autoplay)
commands.set("h", help)
commands.set("shuffle", shuffle)
commands.set("remove", remove)
commands.set("np", np)
commands.set("loop", loop)
commands.set("seek", seek)

client.once("clientReady", () => {
  if (!client.user) {
    console.error("Bot conectado pero sin usuario")
    return
  }
  console.log(`Bot conectado como ${client.user.tag}`)
})

client.on("error", () => {
  console.error("Error del cliente Discord")
})

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const handler = commands.get(interaction.commandName)
    if (handler) {
      try {
        await handler(interaction)
      } catch {
        console.error(`Error en comando ${interaction.commandName}`)
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply("Ocurrió un error al ejecutar el comando")
        } else {
          await interaction.reply({ content: "Ocurrió un error al ejecutar el comando", ephemeral: true })
        }
      }
    }
    return
  }

  if (interaction.isAutocomplete()) {
    const query = interaction.options.getFocused()
    const results = await autocompleteSearch(query)
    await interaction.respond(results.slice(0, 10))
    return
  }

  if (interaction.isButton()) {
    const queue = musicManager.get(interaction.guildId!)
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
        case "q_playback_stop":
          queue.stop()
          musicManager.delete(interaction.guildId!)
          musicManager.clearQueueMessage(interaction.guildId!)
          try {
            await interaction.update({ embeds: [], components: [], content: "⏹ Reproducción detenida" })
          } catch { /* message might be gone */ }
          break
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
    return
  }

})

client.login(process.env.DISCORD_TOKEN).catch(() => {
  console.error("Error al iniciar sesión")
  process.exit(1)
})
