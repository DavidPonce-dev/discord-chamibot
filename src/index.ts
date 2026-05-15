import { Client, GatewayIntentBits, ChatInputCommandInteraction } from "discord.js"
import dotenv from "dotenv"
import { execute as play } from "./commands/play"
import { execute as skip } from "./commands/skip"
import { execute as queue } from "./commands/queue"
import { execute as pause } from "./commands/pause"
import { execute as resume } from "./commands/resume"
import { execute as stop } from "./commands/stop"
import { execute as autoplay } from "./commands/autoplay"

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

client.once("clientReady", () => {
  console.log(`Bot conectado como ${client.user?.tag}`)
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const handler = commands.get(interaction.commandName)
  if (handler) {
    await handler(interaction)
  }
})

client.login(process.env.DISCORD_TOKEN)
