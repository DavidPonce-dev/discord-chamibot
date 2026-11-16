import { Client, GatewayIntentBits, type ButtonInteraction, type GuildTextBasedChannel } from "discord.js"
import type { MusicUseCases } from "../../usecases/music"
import type { QueueUseCases } from "../../usecases/queue"
import type { RadioUseCases } from "../../usecases/radio"
import type { AdminUseCases } from "../../usecases/admin"
import type { SearchUseCases } from "../../usecases/search"
import type { LoggerPort } from "../../domain/ports"
import { createCommandHandlers } from "./commands"
import { handleButton } from "./buttons"
import { createVoiceWatcher } from "./voice-watch"
import { getErrorMessage } from "../../shared/error"
import { editTemporary } from "../../shared/messages"

type BotDeps = Readonly<{
  music: MusicUseCases
  queue: QueueUseCases
  radio: RadioUseCases
  admin: AdminUseCases
  search: SearchUseCases
  updateUI: (guildId: string) => void
  initializeQueueDisplay: (guildId: string, channel: GuildTextBasedChannel | undefined) => Promise<void>
  refreshButtonMessage: (interaction: ButtonInteraction, page?: number) => Promise<void>
  onChannelMessage: (guildId: string, channelId: string, messageId: string) => void
  blacklistIsBlacklisted: (guildId: string) => boolean
  autocompleteSearch: (query: string) => Promise<readonly { name: string; value: string }[]>
  logger: LoggerPort
}>

export const createBot = (deps: BotDeps): Client => {
  const { music, queue, radio, admin, search, updateUI, initializeQueueDisplay, refreshButtonMessage, onChannelMessage, blacklistIsBlacklisted, autocompleteSearch, logger } = deps

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      // Only to know that someone posted below the player; message content is not requested
      GatewayIntentBits.GuildMessages,
    ],
  })

  const commandHandlers = createCommandHandlers({ music, queue, radio, admin, search, updateUI, initializeQueueDisplay, logger })

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

  client.on("error", (error: Error) => {
    logger.error("discord", "Error del cliente Discord", { error: error.message })
  })

  // discord.js waits out rate limits silently: without this a throttled route just looks like a slow bot
  client.rest.on("rateLimited", (info) => {
    logger.warn("discord", "Rate limit de Discord", {
      method: info.method,
      route: info.route,
      retryAfterMs: info.retryAfter,
      global: info.global,
    })
  })

  client.on("guildCreate", async (guild) => {
    if (blacklistIsBlacklisted(guild.id)) {
      logger.event("blacklist", `Auto-leaving blacklisted guild ${guild.name} (${guild.id})`)
      try { await guild.leave() } catch {}
      return
    }
    logger.event("discord", "Bot anadido a servidor", {
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

  const voiceWatcher = createVoiceWatcher({ music, logger })

  client.on("voiceStateUpdate", (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return
    voiceWatcher.onVoiceStateUpdate({
      guildId: newState.guild.id,
      isSelf: newState.id === client.user?.id,
      oldChannelId: oldState.channelId,
      newChannelId: newState.channelId,
    })
  })

  client.on("messageCreate", (message) => {
    // The bot's own messages are the player itself or replies that delete themselves in seconds
    if (!message.guildId || message.author.id === client.user?.id) return
    onChannelMessage(message.guildId, message.channelId, message.id)
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

      const guildId = interaction.guildId
      if (!guildId) {
        await interaction.reply({ content: "Solo en servidores", ephemeral: true }).catch(() => {})
        return
      }

      const handler = commandHandlers[cmd]
      if (handler) {
        try {
          await handler(interaction, guildId, userTag)
          logger.info("command", `/${cmd} ejecutado exitosamente`, { user: userTag, guild: guildName })
        } catch (e: unknown) {
          logger.error("command", `Error en comando /${cmd}`, {
            user: userTag,
            guild: guildName,
            error: getErrorMessage(e),
          })
          if (interaction.replied || interaction.deferred) {
            await editTemporary(interaction, "Ocurrio un error al ejecutar el comando")
          } else {
            await interaction.reply({ content: "Ocurrio un error al ejecutar el comando", ephemeral: true })
          }
        }
      }
      return
    }

    if (interaction.isAutocomplete()) {
      try {
        const query = interaction.options.getFocused()
        const results = await autocompleteSearch(query)
        await interaction.respond(results as { name: string; value: string }[])
      } catch (error) {
        const msg = getErrorMessage(error)
        if (msg.includes("Unknown interaction") || msg.includes("10062")) {
          logger.debug("discord", "Autocomplete expired (interaction timeout)")
        } else {
          logger.error("discord", "Error en autocomplete", { error: msg })
        }
      }
      return
    }

    if (interaction.isButton()) {
      logger.event("button", "Boton presionado", {
        user: userTag,
        guild: guildName,
        customId: interaction.customId,
      })
      await handleButton(interaction, { music, queue, radio, refreshMessage: refreshButtonMessage, logger })
      return
    }
  })

  return client
}
