import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { parseDuration, buildProgressBar, paginate } from "@/utils/format"
import { createBaseEmbed } from "@/ui/embeds/BaseEmbed"
import { TRACKS_PER_PAGE } from "@/config/ui"

export function buildQueueContent(queue: TrackScheduler, page: number, statusTitle?: string) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const { pageItems: pageTracks } = paginate(tracks, page, TRACKS_PER_PAGE)

  const embedLines: string[] = []
  if (statusTitle) {
    embedLines.push(statusTitle)
  }
  if (current) {
    embedLines.push(`Reproduciendo : ${current.title}`)
    const pos = queue.getPosition()
    const total = parseDuration(current.duration)
    embedLines.push(buildProgressBar(pos, total))
  }
  const embedDescription = embedLines.join("\n")

  const embed = createBaseEmbed()
  if (embedDescription) {
    embed.setDescription(embedDescription)
  }

  return embed
}

export function buildEmptyEmbed() {
  return createBaseEmbed()
    .setDescription("La cola est\u00e1 vac\u00eda")
}
