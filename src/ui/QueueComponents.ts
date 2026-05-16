import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js"
import { TrackScheduler } from "../services/TrackScheduler"
import { TRACKS_PER_PAGE } from "./QueueEmbed"

export function buildTrackRows(queue: TrackScheduler, page: number) {
  const tracks = queue.getQueue()
  const totalPages = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const startIdx = (clampedPage - 1) * TRACKS_PER_PAGE
  const pageTracks = tracks.slice(startIdx, startIdx + TRACKS_PER_PAGE)

  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  pageTracks.forEach((t, i) => {
    const idx = startIdx + i
    const canMoveUp = idx > 0
    const canMoveDown = idx < tracks.length - 1
    const pos = idx + 1
    const dur = t.duration ?? ""
    const label = `${pos}. ${t.title}${dur ? ` (${dur})` : ""}`

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`q_del_${idx}`)
        .setEmoji("🗑")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`q_up_${idx}`)
        .setEmoji("⬆")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canMoveUp),
      new ButtonBuilder()
        .setCustomId(`q_down_${idx}`)
        .setEmoji("⬇")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canMoveDown),
      new ButtonBuilder()
        .setCustomId(`q_track_${idx}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    )
    rows.push(row)
  })

  return rows
}

export function buildNavRow(page: number, totalPages: number) {
  if (totalPages <= 1) return null

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("q_page_prev")
      .setEmoji("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("q_page_indicator")
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("q_page_next")
      .setEmoji("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  )
}

export function buildPlaybackRow(queue: TrackScheduler) {
  const isPaused = queue.isPaused()

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("q_playback_pause")
      .setEmoji(isPaused ? "▶" : "⏸")
      .setLabel(isPaused ? "Reanudar" : "Pausar")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("q_playback_skip")
      .setEmoji("⏭")
      .setLabel("Siguiente")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("q_playback_shuffle")
      .setEmoji("🔀")
      .setLabel("Mezclar")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("q_playback_clear")
      .setEmoji("🗑")
      .setLabel("Limpiar")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("q_playback_autoplay")
      .setEmoji("💿")
      .setLabel(queue.isAutoplayEnabled() ? "Radio: ON" : "Radio: OFF")
      .setStyle(queue.isAutoplayEnabled() ? ButtonStyle.Success : ButtonStyle.Secondary),
  )
}

export function buildNowPlayingButtons(queue: TrackScheduler) {
  const pauseLabel = queue.isPaused() ? "▶ Reanudar" : "⏸ Pausar"
  const pauseId = queue.isPaused() ? "np_resume" : "np_pause"

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("np_seek_back").setEmoji("⏪").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(pauseId).setLabel(pauseLabel).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("np_skip").setEmoji("⏭").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("np_loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
  )
}
