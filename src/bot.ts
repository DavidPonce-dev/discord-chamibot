import { Client, GatewayIntentBits, ChatInputCommandInteraction } from "discord.js"
import { getCommandMap } from "@/commands/registry"
import { autocompleteSearch } from "@/services/search/YouTubeResolver"
import { handleButton } from "@/handlers/ButtonHandler"
import { editTemporary } from "@/utils/messages"
import { logger } from "@/utils/logger"
import { getErrorMessage } from "@/utils/error"

let botClient: Client | null = null

export function getBotClient(): Client | null {
  return botClient
}

export function createBot(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  })

  botClient = client

  const commands = getCommandMap()

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

  return client
}
