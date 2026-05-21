import { EmbedBuilder } from "discord.js"
import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { parseDuration, buildProgressBar, calcTotalPages, clampPage } from "@/utils/format"
import { TRACKS_PER_PAGE } from "@/constants"

export function buildQueueContent(queue: TrackScheduler, page: number, statusTitle?: string) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const isPaused = queue.isPaused()
  const totalPages = calcTotalPages(tracks.length, TRACKS_PER_PAGE)
  const clampedPage = clampPage(page, totalPages)
  const startIdx = (clampedPage - 1) * TRACKS_PER_PAGE
  const pageTracks = tracks.slice(startIdx, startIdx + TRACKS_PER_PAGE)

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

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Charmin Charmeleon 🎵")
  if (embedDescription) {
    embed.setDescription(embedDescription)
  }

  return embed
}

export function buildEmptyEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Charmin Charmeleon 🎵")
    .setDescription("La cola está vacía")
}
