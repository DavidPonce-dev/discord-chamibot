import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js"

const commands = [
  { name: "/p", description: "Reproduce o añade a la cola un tema de YouTube" },
  { name: "/s", description: "Salta al siguiente tema" },
  { name: "/pa", description: "Pausa la reproducción" },
  { name: "/r", description: "Reanuda la reproducción" },
  { name: "/q", description: "Muestra la cola de reproducción" },
  { name: "/st", description: "Detiene y limpia la cola" },
  { name: "/ap", description: "Activa/desactiva el autoplay" },
  { name: "/h", description: "Muestra este mensaje de ayuda" },
]

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Comandos del Bot")
    .setDescription("Aquí están todos los comandos disponibles:")
    .addFields(
      commands.map((cmd) => ({
        name: cmd.name,
        value: cmd.description,
        inline: false,
      })),
    )
    .setFooter({ text: "Usá /p <nombre o URL> para empezar" })
    .setTimestamp()

  await interaction.reply({ embeds: [embed] })
}
