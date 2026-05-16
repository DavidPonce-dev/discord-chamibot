import { EmbedBuilder } from "discord.js"
import { TrackScheduler } from "../services/TrackScheduler"

export function buildNowPlayingEmbed(queue: TrackScheduler) {
  const track = queue.getCurrentTrack()!
  const position = queue.getPosition()
  const minutes = Math.floor(position / 60)
  const seconds = position % 60
  const progress = `${minutes}:${String(seconds).padStart(2, "0")}`

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Charmin Charmeleon 🎵")
    .setDescription(`Reproduciendo : ${track.title}`)
    .addFields(
      { name: "Pedido por", value: track.requestedBy, inline: true },
      { name: "Duración", value: track.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: progress, inline: true },
    )

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail)
  }

  return embed
}
