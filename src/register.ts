import { REST, Routes, ApplicationCommandOptionType } from "discord.js"
import { config } from "@/config"

const commands = [
  {
    name: "p",
    description: "Reproduce o añade a la cola un tema de YouTube",
    options: [
      {
        name: "query",
        description: "URL o texto de búsqueda",
        type: ApplicationCommandOptionType.String,
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
    name: "sh",
    description: "Mezcla aleatoriamente la cola",
  },
  {
    name: "rm",
    description: "Elimina un tema de la cola por su posición",
    options: [
      {
        name: "position",
        description: "Número de posición en la cola",
        type: ApplicationCommandOptionType.Integer,
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
    name: "l",
    description: "Cambia el modo de repetición (none / one / all)",
  },
  {
    name: "sk",
    description: "Adelanta o atrasa la reproducción",
    options: [
      {
        name: "seconds",
        description: "Segundos a avanzar (ej: 120 para 2 minutos)",
        type: ApplicationCommandOptionType.Number,
        required: true,
        min_value: 0,
      },
    ],
  },
]

const rest = new REST({ version: "10" }).setToken(config.discord.token)

async function main() {
  console.log("Registrando comandos...")
  await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands })
  console.log("Comandos registrados")
}

main().catch(console.error)
