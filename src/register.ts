import { REST, Routes } from "discord.js"
import { config } from "@/config"
import { getCommandDefinitions } from "@/commands/registry"

const rest = new REST({ version: "10" }).setToken(config.discord.token)

async function main() {
  console.log("Registrando comandos...")
  await rest.put(Routes.applicationCommands(config.discord.clientId), { body: getCommandDefinitions() })
  console.log("Comandos registrados")
}

main().catch(console.error)
