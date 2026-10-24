import { escapeMarkdown } from "discord.js"
import type { GuildSession, Track } from "../../domain/types"
import { parseDuration, buildProgressBar, formatTime } from "../../shared/format"
import { createBaseEmbed } from "./base-embed"
import { getPosition } from "../../domain/session"
import { displayTitle, trackNames, trackThumbnail } from "../../domain/track-parser"
import { RADIO_MARK } from "../../config/ui"

const requesterLabel = (track: Track): string =>
  track.requestedBy === "radio" ? `${RADIO_MARK} Radio` : track.requestedBy

// What plays after the current track, mirroring Queue.dequeue: user queue first, then radio
export const describeNext = (session: GuildSession): string => {
  const next = session.queue.userTracks[0]
  if (next) return `${displayTitle(next)} — pedido por ${next.requestedBy}`
  if (!session.prefs.autoplay) return "Nada en cola"
  const radioNext = session.queue.radioTracks[0]
  if (radioNext) return `${RADIO_MARK} ${displayTitle(radioNext)}`
  return `${RADIO_MARK} Buscando recomendación…`
}

export function buildQueueContent(session: GuildSession, _page: number): ReturnType<typeof createBaseEmbed> {
  const current = session.queue.current

  const fields: { name: string; value: string; inline: boolean }[] = []

  if (current) {
    const { artist, song } = trackNames(current)

    // Titles like "*NSYNC" or "||spoiler||" would otherwise break the formatting
    fields.push({ name: "\u{1F3B5} Cancion", value: `***${escapeMarkdown(song)}***`, inline: false })
    if (artist) {
      fields.push({ name: "\u{1F3A4} Artista", value: `**${escapeMarkdown(artist)}**`, inline: false })
    }

    if (current.album) {
      fields.push({ name: "\u{1F4BF} Album", value: escapeMarkdown(current.album), inline: false })
    }

    const pos = getPosition(session)
    const total = parseDuration(current.duration)
    fields.push({ name: "\u200b", value: buildProgressBar(pos, total), inline: false })

    fields.push(
      { name: "Pedido por", value: requesterLabel(current), inline: true },
      { name: "Duracion", value: current.duration ?? "Desconocida", inline: true },
      { name: "Transcurrido", value: formatTime(pos), inline: true },
      { name: "⏭ Siguiente", value: describeNext(session), inline: false },
    )
  }

  const embed = createBaseEmbed()
  if (fields.length > 0) {
    embed.addFields(fields)
  }

  const thumbnail = current ? trackThumbnail(current) : undefined
  if (thumbnail) {
    embed.setThumbnail(thumbnail)
  }

  return embed
}
