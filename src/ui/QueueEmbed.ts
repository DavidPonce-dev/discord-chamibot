import { EmbedBuilder } from "discord.js"
import { TrackScheduler } from "../services/TrackScheduler"
import { parseDuration, buildProgressBar } from "../utils/format"

export const TRACKS_PER_PAGE = 3

export function buildQueueContent(queue: TrackScheduler, page: number, statusTitle?: string) {
  const tracks = queue.getQueue()
  const current = queue.getCurrentTrack()
  const isPaused = queue.isPaused()
  const totalPages = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
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
