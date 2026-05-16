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
        autocomplete: true,
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
  {
    name: "shuffle",
    description: "Mezcla aleatoriamente la cola",
  },
  {
    name: "remove",
    description: "Elimina un tema de la cola por su posición",
    options: [
      {
        name: "position",
        description: "Número de posición en la cola",
        type: 4,
        required: true,
        min_value: 1,
      },
    ],
  },
  {
    name: "np",
    description: "Muestra el tema que se está reproduciendo",
  },
  {
    name: "loop",
    description: "Cambia el modo de repetición (none / one / all)",
  },
  {
    name: "seek",
    description: "Adelanta o atrasa la reproducción",
    options: [
      {
        name: "seconds",
        description: "Segundos a avanzar (ej: 120 para 2 minutos)",
        type: 10,
        required: true,
        min_value: 0,
      },
    ],
  },
]

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!)

async function main() {
  console.log("Registrando comandos...")
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commands })
  console.log("Comandos registrados")
}

main().catch(console.error)
