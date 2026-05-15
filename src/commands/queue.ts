import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || queue.getSize() === 0) {
    return interaction.reply({ content: "La cola está vacía", ephemeral: true })
  }

  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const lines: string[] = []

  if (current) {
    lines.push(`**Reproduciendo ahora:** ${current.title} — pedido por ${current.requestedBy}`)
  }

  tracks.slice(0, 10).forEach((t, i) => {
    lines.push(`**${i + 1}.** ${t.title} — pedido por ${t.requestedBy}`)
  })

  if (tracks.length > 10) {
    lines.push(`... y ${tracks.length - 10} más`)
  }

  await interaction.reply(lines.join("\n"))
}
