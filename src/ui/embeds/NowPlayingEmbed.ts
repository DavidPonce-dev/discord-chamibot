import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { formatTime } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"
import { extractSongOnly } from "@/radio/LastFmRecommender"

export function buildNowPlayingEmbed(queue: TrackScheduler) {
  const track = queue.getCurrentTrack()!
  const position = queue.getPosition()
  const progress = formatTime(position)

  const artist = track.artist
  const song = track.song ?? track.title

  const embedLines: string[] = []
  if (artist) {
    embedLines.push(`***${song}***`)
    embedLines.push(`**\uD83C\uDFA4 ${artist}**`)
  } else {
    embedLines.push(`***${track.title}***`)
  }

  embedLines.push("")

  const embed = createBaseEmbed()
    .setDescription(embedLines.join("\n"))

  const fields = [
    { name: "Pedido por", value: track.requestedBy, inline: true },
    { name: "Duraci\u00f3n", value: track.duration ?? "Desconocida", inline: true },
    { name: "Transcurrido", value: progress, inline: true },
  ]

  if (queue.isAutoplayEnabled()) {
    const nextTrack = queue.getRadioNext()
    if (nextTrack) {
      const nextSong = extractSongOnly(nextTrack.canonicalTitle ?? nextTrack.title)
      fields.push({ name: "\u23ed Siguiente", value: nextSong || nextTrack.title, inline: false })
    }
  }

  embed.addFields(fields)

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail)
  }

  return embed
}
