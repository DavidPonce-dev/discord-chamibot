import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { formatTime } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"

export function buildNowPlayingEmbed(queue: TrackScheduler) {
  const track = queue.getCurrentTrack()!
  const position = queue.getPosition()
  const progress = formatTime(position)

  const embed = createBaseEmbed()
    .setDescription(`Reproduciendo : ${track.title}`)
    .addFields(
      { name: "Pedido por", value: track.requestedBy, inline: true },
      { name: "Duraci\u00f3n", value: track.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: progress, inline: true },
    )

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail)
  }

  return embed
}
