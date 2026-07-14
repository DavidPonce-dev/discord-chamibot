import { TrackScheduler } from "@/music/TrackScheduler"
import { parseDuration, buildProgressBar, formatTime, paginate } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"
import { TRACKS_PER_PAGE } from "@/config/ui"

export function buildQueueContent(queue: TrackScheduler, page: number) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const { pageItems: pageTracks } = paginate(tracks, page, TRACKS_PER_PAGE)

  const fields: { name: string; value: string; inline: boolean }[] = []

  if (current) {
    const artist = current.artist
    const song = current.song ?? current.title

    if (artist) {
      fields.push({ name: "\uD83C\uDFB5 Canci\u00f3n", value: `***${song}***`, inline: false })
      fields.push({ name: "\uD83C\uDFA4 Artista", value: `**${artist}**`, inline: false })
    } else {
      fields.push({ name: "\uD83C\uDFB5 Canci\u00f3n", value: `***${current.title}***`, inline: false })
    }

    if (current.album) {
      fields.push({ name: "\uD83D\uDCBF \u00c1lbum", value: current.album, inline: false })
    }

    const pos = queue.getPosition()
    const total = parseDuration(current.duration)
    fields.push({ name: "\u200b", value: buildProgressBar(pos, total), inline: false })

    fields.push(
      { name: "Pedido por", value: current.requestedBy, inline: true },
      { name: "Duraci\u00f3n", value: current.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: formatTime(pos), inline: true },
    )
  }

  const embed = createBaseEmbed()
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
