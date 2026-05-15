import { REST, Routes } from "discord.js"
import dotenv from "dotenv"

dotenv.config()

const commands = [
  {
    name: "p",
    description: "Reproduce o añade a la cola un tema de YouTube",
    options: [
      {
        name: "query",
        description: "URL o texto de búsqueda",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "s",
    description: "Salta al siguiente tema",
  },
  {
    name: "q",
    description: "Muestra la cola de reproducción",
  },
  {
    name: "pa",
    description: "Pausa la reproducción",
  },
  {
    name: "r",
    description: "Reanuda la reproducción",
  },
  {
    name: "st",
    description: "Detiene y limpia la cola",
  },
  {
    name: "ap",
    description: "Activa/desactiva el autoplay",
  },
  {
    name: "h",
    description: "Muestra todos los comandos disponibles",
  },
]

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!)

async function main() {
  console.log("Registrando comandos...")
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commands })
  console.log("Comandos registrados")
}

main().catch(console.error)
