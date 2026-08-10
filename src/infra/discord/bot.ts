import { Client, GatewayIntentBits, type ButtonInteraction, type GuildTextBasedChannel } from "discord.js"
import type { MusicUseCases } from "../../usecases/music"
import type { QueueUseCases } from "../../usecases/queue"
import type { RadioUseCases } from "../../usecases/radio"
import type { AdminUseCases } from "../../usecases/admin"
import type { SearchUseCases } from "../../usecases/search"
import type { LoggerPort } from "../../domain/ports"
import { createCommandHandlers } from "./commands"
import { handleButton } from "./buttons"
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
  blacklistIsBlacklisted: (guildId: string) => boolean
  autocompleteSearch: (query: string) => Promise<readonly { name: string; value: string }[]>
  logger: LoggerPort
}>

export const createBot = (deps: BotDeps): Client => {
  const { music, queue, radio, admin, search, updateUI, initializeQueueDisplay, refreshButtonMessage, blacklistIsBlacklisted, autocompleteSearch, logger } = deps

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
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

  client.on("voiceStateUpdate", (oldState, newState) => {
    if (newState.channelId && !oldState.channelId) {
      logger.event("voice", "Usuario entro a canal de voz", {
        user: newState.member?.user.username ?? "unknown",
        channel: newState.channel?.name ?? "unknown",
        guild: newState.guild.name,
      })
    } else if (oldState.channelId && !newState.channelId) {
      logger.event("voice", "Usuario salio de canal de voz", {
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
