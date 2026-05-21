import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
} from "discord.js"
import dotenv from "dotenv"
import { execute as play } from "./commands/play"
import { execute as queue } from "./commands/queue"
import { execute as np } from "./commands/np"
import { execute as help } from "./commands/help"
import { execute as autoplay } from "./commands/autoplay"
import { pause, resume, skip, stop } from "./commands/playback"
import { remove, shuffle, loop } from "./commands/queue-control"
import { autocompleteSearch } from "./utils/search"
import { handleButton } from "./handlers/ButtonHandler"
import { execute as seek } from "./commands/seek"
import { editTemporary } from "./utils/messages"
import { logger } from "./utils/logger"

process.on("unhandledRejection", (reason) => {
  const msg = String(reason)
  // Errores conocidos de voz que no requieren acción
  if (msg.includes("IP discovery") || msg.includes("socket closed")) {
    logger.debug("process", "Error de voz conocido (ignorado)", { reason: msg })
    return
  }
  logger.error("process", "Unhandled rejection", { reason: msg })
})

process.on("uncaughtException", (err) => {
  logger.error("process", "Uncaught exception", { error: err.message, stack: err.stack })
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
    logger.error("discord", "Bot conectado pero sin usuario")
    return
  }
  logger.info("discord", `Bot conectado como ${client.user.tag}`, {
    id: client.user.id,
    guilds: client.guilds.cache.size,
  })
})

client.on("error", (error) => {
  logger.error("discord", "Error del cliente Discord", { error: error.message })
})

client.on("guildCreate", (guild) => {
  logger.event("discord", "Bot añadido a servidor", {
    guild: guild.name,
    id: guild.id,
    members: guild.memberCount,
  })
})

client.on("guildDelete", (guild) => {
  logger.event("discord", "Bot removido de servidor", {
    guild: guild.name,
    id: guild.id,
  })
})

client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.channelId && !oldState.channelId) {
    logger.event("voice", "Usuario entró a canal de voz", {
      user: newState.member?.user.username ?? "unknown",
      channel: newState.channel?.name ?? "unknown",
      guild: newState.guild.name,
    })
  } else if (oldState.channelId && !newState.channelId) {
    logger.event("voice", "Usuario salió de canal de voz", {
      user: oldState.member?.user.username ?? "unknown",
      channel: oldState.channel?.name ?? "unknown",
      guild: oldState.guild.name,
    })
  }
})

client.on("interactionCreate", async (interaction) => {
  const userTag = interaction.user.username
  const guildName = interaction.guild?.name ?? "DM"

  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName
    logger.event("command", `/${cmd}`, {
      user: userTag,
      guild: guildName,
      channel: interaction.channel?.type ?? "unknown",
    })

    const handler = commands.get(cmd)
    if (handler) {
      try {
        await handler(interaction)
        logger.info("command", `/${cmd} ejecutado exitosamente`, {
          user: userTag,
          guild: guildName,
        })
      } catch (err) {
        logger.error("command", `Error en comando /${cmd}`, {
          user: userTag,
          guild: guildName,
          error: err instanceof Error ? err.message : String(err),
        })
        if (interaction.replied || interaction.deferred) {
          await editTemporary(interaction, "Ocurrió un error al ejecutar el comando")
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
    logger.event("button", "Botón presionado", {
      user: userTag,
      guild: guildName,
      customId: interaction.customId,
    })
    await handleButton(interaction)
    return
  }
})

logger.info("bot", "Iniciando conexión a Discord...")
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  logger.error("discord", "Error al iniciar sesión", { error: err.message })
  process.exit(1)
})
