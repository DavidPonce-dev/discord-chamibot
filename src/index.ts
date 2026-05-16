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

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason)
})

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err)
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
    await handleButton(interaction)
    return
  }
})

client.login(process.env.DISCORD_TOKEN).catch(() => {
  console.error("Error al iniciar sesión")
  process.exit(1)
})
