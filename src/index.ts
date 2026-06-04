import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
} from "discord.js"
import { execute as play } from "@/commands/music/play"
import { execute as queue } from "@/commands/queue/queue"
import { execute as nowplaying } from "@/commands/music/now-playing"
import { execute as help } from "@/commands/general/help"
import { execute as autoplay } from "@/commands/general/autoplay"
import { execute as pause } from "@/commands/playback/pause"
import { execute as resume } from "@/commands/playback/resume"
import { execute as skip } from "@/commands/playback/skip"
import { execute as stop } from "@/commands/playback/stop"
import { remove, shuffle, loop } from "@/commands/queue/queue-control"
import { autocompleteSearch } from "@/services/search/YouTubeResolver"
import { handleButton } from "@/handlers/ButtonHandler"
import { execute as seek } from "@/commands/music/seek"
import { editTemporary } from "@/utils/messages"
import { logger } from "@/utils/logger"
import { setupCookies, setCookieFile, validateCookies, getRefresherInstance } from "@/services/cookie/CookieManager"
import { CookieScheduler } from "@/services/cookie/CookieScheduler"
import { startAdminServer, stopAdminServer } from "@/services/admin/AdminServer"
import { getErrorMessage } from "@/utils/error"
import { config } from "@/config"

let cookieScheduler: CookieScheduler | null = null

function startCookieScheduler(cookiePath: string | null) {
  if (!cookiePath) {
    logger.warn("cookies", "No cookies available, scheduler not started")
    return
  }

  const validation = validateCookies()
  if (!validation.isValid) {
    logger.warn("cookies", "Invalid cookies, scheduler not started")
    return
  }

  const refresher = getRefresherInstance()
  cookieScheduler = new CookieScheduler(refresher, config.youtube.cookieRefreshIntervalMs)
  cookieScheduler.start()

  logger.info("cookies", "Cookie scheduler initialized", {
    intervalHours: config.youtube.cookieRefreshIntervalMs / (1000 * 60 * 60),
  })
}

async function stopCookieScheduler() {
  if (cookieScheduler) {
    cookieScheduler.stop()
    cookieScheduler = null
  }
}

process.on("SIGINT", async () => {
  logger.info("process", "Shutting down...")
  await stopCookieScheduler()
  await stopAdminServer()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  logger.info("process", "Shutting down...")
  await stopCookieScheduler()
  await stopAdminServer()
  process.exit(0)
})

process.on("unhandledRejection", (reason) => {
  const msg = String(reason)
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

const cookiePath = setupCookies()
setCookieFile(cookiePath)
if (cookiePath) {
  logger.info("bot", "YouTube cookies configuradas", { path: cookiePath })
  startCookieScheduler(cookiePath)
} else {
  logger.warn("bot", "Sin YouTube cookies (YOUTUBE_COOKIES no configurada)")
}

const adminPort = parseInt(process.env.ADMIN_PORT || "3002", 10)
startAdminServer(adminPort)

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
commands.set("sh", shuffle)
commands.set("rm", remove)
commands.set("np", nowplaying)
commands.set("l", loop)
commands.set("sk", seek)

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
          error: getErrorMessage(err),
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
    await interaction.respond(results)
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
client.login(config.discord.token).catch((err) => {
  logger.error("discord", "Error al iniciar sesión", { error: err.message })
  process.exit(1)
})
