import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js"
import type { GuildSession } from "../../domain/types"
import { BUTTON_PREFIXES, TRACKS_PER_PAGE } from "../../config/ui"
import { paginate } from "../../shared/format"

const MAX_TRACK_LABEL = 50

function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + "..."
}

export function buildTrackRows(session: GuildSession, page: number): ActionRowBuilder<ButtonBuilder>[] {
  const allTracks = [...session.queue.userTracks, ...session.queue.radioTracks]
  const { pageItems, startIdx } = paginate(allTracks, page, TRACKS_PER_PAGE)

  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  pageItems.forEach((t, i) => {
    const idx = startIdx + i
    const pos = idx + 1
    const dur = t.duration ?? ""
    const titlePart = `${pos}. ${t.title}`
    const durPart = dur ? ` (${dur})` : ""
    const label = truncateLabel(titlePart, MAX_TRACK_LABEL - durPart.length) + durPart

    if (t.requestedBy === "radio") {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueRadioShuffle}${idx}`)
          .setEmoji("\u{1F504}")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueTrack}${idx}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      )
      rows.push(row)
    } else {
      const canMoveUp = idx > 0
      const canMoveDown = idx < allTracks.length - 1
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueDelete}${idx}`)
          .setEmoji("\u{1F5D1}")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueUp}${idx}`)
          .setEmoji("\u2B06")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canMoveUp),
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueDown}${idx}`)
          .setEmoji("\u2B07")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canMoveDown),
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIXES.queueTrack}${idx}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      )
      rows.push(row)
    }
  })

  return rows
}

export function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> | null {
  if (totalPages <= 1) return null

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePagePrev)
      .setEmoji("\u25C0")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePageIndicator)
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePageNext)
      .setEmoji("\u25B6")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  )
}

export function buildPlaybackRow(session: GuildSession): ActionRowBuilder<ButtonBuilder> {
  const isPaused = session.playback.isPaused
  const autoplayEnabled = session.prefs.autoplay

  const autoplayBtn = new ButtonBuilder()
    .setCustomId(BUTTON_PREFIXES.queuePlaybackAutoplay)
    .setStyle(autoplayEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setEmoji("\u{1F4FB}")
  if (autoplayEnabled) autoplayBtn.setLabel("\u{1F3B6}")

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackPause)
      .setEmoji(isPaused ? "\u25B6" : "\u23F8")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackSkip)
      .setEmoji("\u23ED")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackShuffle)
      .setEmoji("\u{1F500}")
      .setStyle(ButtonStyle.Secondary),
    autoplayBtn,
    new ButtonBuilder()
      .setCustomId(BUTTON_PREFIXES.queuePlaybackStop)
      .setEmoji("\u2716")
      .setStyle(ButtonStyle.Danger),
  )
}
