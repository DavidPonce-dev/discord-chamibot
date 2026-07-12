import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"

const commands = [
  { name: "/p", description: "Reproduce o a\u00f1ade a la cola un tema de YouTube" },
  { name: "/s", description: "Salta al siguiente tema" },
  { name: "/pa", description: "Pausa la reproducci\u00f3n" },
  { name: "/r", description: "Reanuda la reproducci\u00f3n" },
  { name: "/q", description: "Muestra la cola de reproducci\u00f3n" },
  { name: "/st", description: "Detiene y limpia la cola" },
  { name: "/ap", description: "Activa/desactiva el autoplay" },
  { name: "/h", description: "Muestra este mensaje de ayuda" },
  { name: "/sh", description: "Mezcla aleatoriamente la cola" },
  { name: "/rm", description: "Elimina un tema de la cola por posici\u00f3n" },
  { name: "/np", description: "Muestra/actualiza la cola de reproducci\u00f3n" },
  { name: "/l", description: "Cambia el modo de repetici\u00f3n (none / one / all)" },
  { name: "/sk", description: "Adelanta o atrasa la reproducci\u00f3n" },
  { name: "/lastfm", description: "Configura tu usuario de Last.fm para recomendaciones" },
]

export function buildHelpEmbed() {
  return createBaseEmbed("\ud83c\udfb5 Comandos del Bot")
    .setDescription("Aqu\u00ed est\u00e1n todos los comandos disponibles:")
    .addFields(
      commands.map((cmd) => ({
        name: cmd.name,
        value: cmd.description,
        inline: false,
      })),
    )
    .setFooter({ text: "Us\u00e1 /p <nombre o URL> para empezar" })
    .setTimestamp()
}
