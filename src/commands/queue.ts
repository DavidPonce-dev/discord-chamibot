import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"
import { MusicQueue } from "../music/MusicQueue"

export const TRACKS_PER_PAGE = 3

const queuePages = new Map<string, number>()

export function getQueuePage(guildId: string): number {
  return queuePages.get(guildId) ?? 1
}

export function setQueuePage(guildId: string, page: number) {
  queuePages.set(guildId, page)
}

export function clearQueuePage(guildId: string) {
  queuePages.delete(guildId)
}

function parseDuration(dur: string | undefined): number {
  if (!dur) return 0
  const parts = dur.split(":").map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

function formatPos(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

const NBSP = "\u00A0"

function buildProgressBar(pos: number, total: number, width = 36): string {
  if (total <= 0) return `[${NBSP.repeat(width)}] ${formatPos(pos)} / ?:??`
  const units = Math.round((pos / total) * width * 2)
  let bar = ""
  for (let i = 0; i < width; i++) {
    const filled = units - i * 2
    if (filled >= 2) bar += "█"
    else if (filled === 1) bar += "▌"
    else bar += NBSP
  }
  return `[${bar}] ${formatPos(pos)} / ${formatPos(total)}`
}

export function buildQueueContent(queue: MusicQueue, page: number, statusTitle?: string) {
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

  if (totalPages > 1) {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("q_page_prev")
        .setEmoji("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage <= 1),
      new ButtonBuilder()
        .setCustomId("q_page_indicator")
        .setLabel(`${clampedPage} / ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("q_page_next")
        .setEmoji("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage >= totalPages),
    )
    rows.push(navRow)
  }

  const playbackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
  rows.push(playbackRow)

  return { embeds: [embed], components: rows }
}

function buildEmptyContent() {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Charmin Charmeleon 🎵")
    .setDescription("La cola está vacía")
  return { embeds: [embed], components: [] }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || (queue.getSize() === 0 && !queue.getCurrentTrack())) {
    await interaction.deferReply()
    await interaction.deleteReply().catch(() => {})
    return
  }

  queuePages.set(interaction.guildId!, 1)
  await interaction.deferReply()
  await interaction.deleteReply().catch(() => {})
  const channel = interaction.channel
  if (channel && "send" in channel) {
    const sent = await (channel as any).send(buildQueueContent(queue, 1))
    musicManager.setQueueMessage(interaction.guildId!, sent)
  }
}

export async function updateQueueForGuild(guildId: string, statusTitle?: string, page?: number) {
  const queue = musicManager.get(guildId)
  const msg = musicManager.getQueueMessage(guildId)
  if (!queue || !msg) return

  if (queue.getSize() === 0 && !queue.getCurrentTrack()) {
    try {
      await msg.delete()
    } catch { /* message might be gone */ }
    musicManager.clearQueueMessage(guildId)
    clearQueuePage(guildId)
    musicManager.delete(guildId)
    return
  }

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    await msg.edit(buildQueueContent(queue, currentPage, statusTitle))
  } catch {
    console.log("[Queue] Error al editar mensaje (transitorio, se reintenta)")
  }
}

export async function ensureQueueMessage(
  guildId: string,
  channel: { send: (content: any) => Promise<any> } | undefined,
  statusTitle?: string,
  page?: number,
) {
  const existing = musicManager.getQueueMessage(guildId)
  if (existing) {
    await updateQueueForGuild(guildId, statusTitle, page)
    return
  }
  if (!channel) return

  const queue = musicManager.get(guildId)
  if (!queue) return

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)
  try {
    const msg = await channel.send(buildQueueContent(queue, currentPage, statusTitle))
    musicManager.setQueueMessage(guildId, msg)
  } catch {
    // channel might not be sendable
  }
}

export async function refreshQueueMessage(interaction: MessageComponentInteraction, page?: number) {
  const guildId = interaction.guildId!
  const queue = musicManager.get(guildId)
  const msg = musicManager.getQueueMessage(guildId)

  if (!queue || (queue.getSize() === 0 && !queue.getCurrentTrack())) {
    if (msg) {
      await interaction.deferUpdate()
      await msg.edit(buildEmptyContent()).catch(() => {})
    } else {
      await interaction.update(buildEmptyContent())
    }
    return
  }

  const currentPage = page ?? queuePages.get(guildId) ?? 1
  queuePages.set(guildId, currentPage)

  if (msg) {
    await interaction.deferUpdate()
    await msg.edit(buildQueueContent(queue, currentPage)).catch(() => {})
  } else {
    await interaction.update(buildQueueContent(queue, currentPage))
  }
}
