import { createBaseEmbed } from "./base-embed"

const commands = [
  { name: "/p", description: "Reproduce o anade a la cola un tema de YouTube" },
  { name: "/s", description: "Salta al siguiente tema" },
  { name: "/pa", description: "Pausa la reproduccion" },
  { name: "/r", description: "Reanuda la reproduccion" },
  { name: "/q", description: "Muestra la cola de reproduccion" },
  { name: "/st", description: "Detiene y limpia la cola" },
  { name: "/ap", description: "Activa/desactiva el autoplay" },
  { name: "/h", description: "Muestra este mensaje de ayuda" },
  { name: "/sh", description: "Mezcla aleatoriamente la cola" },
  { name: "/rm", description: "Elimina un tema de la cola por posicion" },
  { name: "/np", description: "Muestra/actualiza la cola de reproduccion" },
  { name: "/l", description: "Cambia el modo de repeticion (none / one / all)" },
  { name: "/sk", description: "Adelanta o atrasa la reproduccion" },
  { name: "/lastfm", description: "Configura tu usuario de Last.fm para recomendaciones" },
]

export function buildHelpEmbed(): ReturnType<typeof createBaseEmbed> {
  return createBaseEmbed("\u{1F3B5} Comandos del Bot")
    .setDescription("Aqui estan todos los comandos disponibles:")
    .addFields(
      commands.map((cmd) => ({
        name: cmd.name,
        value: cmd.description,
        inline: false,
      })),
    )
    .setFooter({ text: "Usa /p <nombre o URL> para empezar" })
    .setTimestamp()
}
