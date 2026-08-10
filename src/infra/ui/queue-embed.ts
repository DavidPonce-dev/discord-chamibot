import type { GuildSession } from "../../domain/types"
import { parseDuration, buildProgressBar, formatTime } from "../../shared/format"
import { createBaseEmbed } from "./base-embed"
import { getPosition } from "../../domain/session"

export function buildQueueContent(session: GuildSession, _page: number): ReturnType<typeof createBaseEmbed> {
  const current = session.queue.current

  const fields: { name: string; value: string; inline: boolean }[] = []

  if (current) {
    const artist = current.artist
    const song = current.song ?? current.title

    if (artist) {
      fields.push({ name: "\u{1F3B5} Cancion", value: `***${song}***`, inline: false })
      fields.push({ name: "\u{1F3A4} Artista", value: `**${artist}**`, inline: false })
    } else {
      fields.push({ name: "\u{1F3B5} Cancion", value: `***${current.title}***`, inline: false })
    }

    if (current.album) {
      fields.push({ name: "\u{1F4BF} Album", value: current.album, inline: false })
    }

    const pos = getPosition(session)
    const total = parseDuration(current.duration)
    fields.push({ name: "\u200b", value: buildProgressBar(pos, total), inline: false })

    fields.push(
      { name: "Pedido por", value: current.requestedBy, inline: true },
      { name: "Duracion", value: current.duration ?? "Desconocida", inline: true },
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

export function buildEmptyEmbed(): ReturnType<typeof createBaseEmbed> {
  return createBaseEmbed()
    .setDescription("La cola esta vacia")
}
