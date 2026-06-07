import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js"
import { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import { BUTTON_PREFIXES, TRACKS_PER_PAGE } from "@/config/ui"
import { paginate } from "@/utils/format"

const MAX_TRACK_LABEL = 50

function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + "..."
}

export function buildTrackRows(queue: TrackScheduler, page: number) {
  const tracks = queue.getQueue()
  const { pageItems, startIdx } = paginate(tracks, page, TRACKS_PER_PAGE)

  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  pageItems.forEach((t, i) => {
    const idx = startIdx + i
    const canMoveUp = idx > 0
    const canMoveDown = idx < tracks.length - 1
    const pos = idx + 1
    const dur = t.duration ?? ""
    const titlePart = `${pos}. ${t.title}`
    const durPart = dur ? ` (${dur})` : ""
    const label = truncateLabel(titlePart, MAX_TRACK_LABEL - durPart.length) + durPart

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIXES.queueDelete}${idx}`)
        .setEmoji("\ud83d\uddd1")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIXES.queueUp}${idx}`)
        .setEmoji("\u2b06")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canMoveUp),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIXES.queueDown}${idx}`)
        .setEmoji("\u2b07")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canMoveDown),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIXES.queueTrack}${idx}`)
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
      .setCustomId(BUTTON_PREFIXES.queuePagePrev)
      .setEmoji("\u25c0")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePageIndicator)
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePageNext)
      .setEmoji("\u25b6")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  )
}

export function buildPlaybackRow(queue: TrackScheduler) {
  const isPaused = queue.isPaused()

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackPause)
      .setEmoji(isPaused ? "\u25b6" : "\u23f8")
      .setLabel(isPaused ? "Reanudar" : "Pausar")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackSkip)
      .setEmoji("\u23ed")
      .setLabel("Siguiente")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackShuffle)
      .setEmoji("\ud83d\udd00")
      .setLabel("Mezclar")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackClear)
      .setEmoji("\ud83d\uddd1")
      .setLabel("Limpiar")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackAutoplay)
      .setEmoji("\ud83d\udcbf")
      .setLabel(queue.isAutoplayEnabled() ? "Radio: ON" : "Radio: OFF")
      .setStyle(queue.isAutoplayEnabled() ? ButtonStyle.Success : ButtonStyle.Secondary),
  )
}

export function buildNowPlayingButtons(queue: TrackScheduler) {
  const pauseLabel = queue.isPaused() ? "\u25b6 Reanudar" : "\u23f8 Pausar"
  const pauseId = queue.isPaused() ? BUTTON_PREFIXES.nowPlayingResume : BUTTON_PREFIXES.nowPlayingPause

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_PREFIXES.nowPlayingSeekBack).setEmoji("\u23ea").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(pauseId).setLabel(pauseLabel).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(BUTTON_PREFIXES.nowPlayingSkip).setEmoji("\u23ed").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(BUTTON_PREFIXES.nowPlayingLoop).setEmoji("\ud83d\udd01").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_PREFIXES.nowPlayingShuffle).setEmoji("\ud83d\udd00").setStyle(ButtonStyle.Secondary),
  )
}
