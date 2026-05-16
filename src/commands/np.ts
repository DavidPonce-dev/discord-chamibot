import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  const track = queue.getCurrentTrack()!
  const position = queue.getPosition()
  const minutes = Math.floor(position / 60)
  const seconds = position % 60
  const progress = `${minutes}:${String(seconds).padStart(2, "0")}`

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Reproduciendo ahora")
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: "Pedido por", value: track.requestedBy, inline: true },
      { name: "Duración", value: track.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: progress, inline: true },
    )

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail)
  }

  const pauseLabel = queue.isPaused() ? "▶ Reanudar" : "⏸ Pausar"
  const pauseId = queue.isPaused() ? "np_resume" : "np_pause"

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("np_seek_back").setEmoji("⏪").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(pauseId).setLabel(pauseLabel).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("np_skip").setEmoji("⏭").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("np_loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
  )

  await interaction.reply({ embeds: [embed], components: [row] })
}
