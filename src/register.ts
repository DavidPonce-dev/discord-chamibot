import { REST, Routes, ApplicationCommandOptionType } from "discord.js"
import { config } from "./config"

const commands = [
  {
    name: "p",
    description: "Reproduce o anade a la cola un tema de YouTube",
    options: [{ name: "query", description: "URL o texto de busqueda", type: ApplicationCommandOptionType.String, required: true, autocomplete: true }],
  },
  { name: "s", description: "Salta al siguiente tema" },
  { name: "q", description: "Muestra la cola de reproduccion" },
  { name: "pa", description: "Pausa la reproduccion" },
  { name: "r", description: "Reanuda la reproduccion" },
  { name: "st", description: "Detiene y limpia la cola" },
  { name: "ap", description: "Activa/desactiva el autoplay" },
  { name: "h", description: "Muestra todos los comandos disponibles" },
  { name: "sh", description: "Mezcla aleatoriamente la cola" },
  {
    name: "rm",
    description: "Elimina un tema de la cola por su posicion",
    options: [{ name: "position", description: "Numero de posicion en la cola", type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }],
  },
  { name: "np", description: "Muestra el tema que se esta reproduciendo" },
  { name: "l", description: "Cambia el modo de repeticion (none / one / all)" },
  {
    name: "sk",
    description: "Adelanta o atrasa la reproduccion",
    options: [{ name: "seconds", description: "Segundos a adelantar (ej: 120 para 2 minutos)", type: ApplicationCommandOptionType.Number, required: true, min_value: 0 }],
  },
  {
    name: "lastfm",
    description: "Configura el usuario de Last.fm para recomendaciones",
    options: [
      { name: "action", description: "Accion a realizar (set, clear, show)", type: ApplicationCommandOptionType.String, required: true },
      { name: "username", description: "Nombre de usuario de Last.fm", type: ApplicationCommandOptionType.String, required: false },
    ],
  },
]

const rest = new REST({ version: "10" }).setToken(config.discord.token)

async function main(): Promise<void> {
  console.log("Registrando comandos...")
  await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands })
  console.log("Comandos registrados")
}

main().catch(console.error)
