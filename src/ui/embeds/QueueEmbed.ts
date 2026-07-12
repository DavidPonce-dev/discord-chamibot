import { TrackScheduler } from "@/music/TrackScheduler"
import { parseDuration, buildProgressBar, formatTime, paginate } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"
import { TRACKS_PER_PAGE } from "@/config/ui"
import { extractSongOnly } from "@/radio/LastFmRecommender"

export function buildQueueContent(queue: TrackScheduler, page: number) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const { pageItems: pageTracks } = paginate(tracks, page, TRACKS_PER_PAGE)

  const embedLines: string[] = []
  const fields: { name: string; value: string; inline: boolean }[] = []

  if (current) {
    const artist = current.artist
    const song = current.song ?? current.title

    if (artist) {
      embedLines.push(`***${song}***`)
      embedLines.push(`**\uD83C\uDFA4 ${artist}**`)
    } else {
      embedLines.push(`***${current.title}***`)
    }

    embedLines.push("")
    const pos = queue.getPosition()
    const total = parseDuration(current.duration)
    embedLines.push(buildProgressBar(pos, total))

    fields.push(
      { name: "Pedido por", value: current.requestedBy, inline: true },
      { name: "Duraci\u00f3n", value: current.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: formatTime(pos), inline: true },
    )

    if (queue.isAutoplayEnabled()) {
      const nextTrack = queue.getRadioNext()
      if (nextTrack) {
        const nextSong = extractSongOnly(nextTrack.canonicalTitle ?? nextTrack.title)
        fields.push({ name: "\u23ed Siguiente", value: nextSong || nextTrack.title, inline: false })
      }
    }
  }

  const embed = createBaseEmbed()
  if (embedLines.length > 0) {
    embed.setDescription(embedLines.join("\n"))
  }
  if (fields.length > 0) {
    embed.addFields(fields)
  }

  if (current?.thumbnail) {
    embed.setThumbnail(current.thumbnail)
  }

  return embed
}

export function buildEmptyEmbed() {
  return createBaseEmbed()
    .setDescription("La cola est\u00e1 vac\u00eda")
}
