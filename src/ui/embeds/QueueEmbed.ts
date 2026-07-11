import { TrackScheduler } from "@/music/TrackScheduler"
import { parseDuration, buildProgressBar, paginate } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"
import { TRACKS_PER_PAGE } from "@/config/ui"

export function buildQueueContent(queue: TrackScheduler, page: number) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const { pageItems: pageTracks } = paginate(tracks, page, TRACKS_PER_PAGE)

  const embedLines: string[] = []
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
  }
  const embedDescription = embedLines.join("\n")

  const embed = createBaseEmbed()
  if (embedDescription) {
    embed.setDescription(embedDescription)
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
