import { ButtonInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { refreshQueueMessage, updateQueueForGuild } from "@/services/queue/QueueUIManager"
import { logger } from "@/utils/logger"
import { requireSession } from "@/utils/guards"
import { BUTTON_PREFIXES, LOOP_LABELS } from "@/config/ui"
import { SEEK_BACK_SECONDS } from "@/config/timeouts"
import { getErrorMessage } from "@/utils/error"

interface QueueButtonAction {
  action: (scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler, idx: number) => void
  logEvent: string
}

const queueIndexActions: Record<string, QueueButtonAction> = {
  [BUTTON_PREFIXES.queueUp]: { action: (s, idx) => s.moveUp(idx), logEvent: "Subir track" },
  [BUTTON_PREFIXES.queueDown]: { action: (s, idx) => s.moveDown(idx), logEvent: "Bajar track" },
  [BUTTON_PREFIXES.queueDelete]: { action: (s, idx) => s.remove(idx), logEvent: "Eliminar de cola" },
}

export async function handleButton(interaction: ButtonInteraction) {
  const result = requireSession(interaction)
  if (!result) return

  const { guildId, scheduler } = result
  const user = interaction.user.username

  try {
    for (const [prefix, { action, logEvent }] of Object.entries(queueIndexActions)) {
      if (interaction.customId.startsWith(prefix)) {
        const idx = parseInt(interaction.customId.slice(prefix.length), 10)
        action(scheduler, idx)
        logger.event("button", logEvent, { user, guildId, index: idx })
        await refreshQueueMessage(interaction)
        return
      }
    }

    if (interaction.customId.startsWith(BUTTON_PREFIXES.queueRadioShuffle)) {
      const idx = parseInt(interaction.customId.slice(BUTTON_PREFIXES.queueRadioShuffle.length), 10)
      const track = await scheduler.reshuffleRadioTrack(idx)
      logger.event("button", "Resugerir track de radio", { user, guildId, index: idx, next: track?.title })
      await refreshQueueMessage(interaction)
      return
    }

    const handler = buttonHandlers[interaction.customId]
    if (handler) {
      await handler(scheduler, interaction, guildId, user)
      return
    }

    logger.warn("button", "Acci\u00f3n no reconocida", { user, guildId, customId: interaction.customId })
    await interaction.reply({ content: "Acci\u00f3n no reconocida", ephemeral: true })
  } catch (error) {
    logger.error("button", "Error en bot\u00f3n", {
      user,
      guildId,
      customId: interaction.customId,
      error: getErrorMessage(error),
    })
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la acci\u00f3n")
      } else {
        await interaction.reply({ content: "Error al ejecutar la acci\u00f3n", ephemeral: true })
      }
    } catch { /* interaction might be expired */ }
  }
}

type ButtonHandler = (
  scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler,
  interaction: ButtonInteraction,
  guildId: string,
  user: string,
) => Promise<void>

const buttonHandlers: Record<string, ButtonHandler> = {
  [BUTTON_PREFIXES.queuePagePrev]: async (s, interaction, guildId, user) => {
    logger.event("button", "P\u00e1gina anterior", { user, guildId })
    await refreshQueueMessage(interaction, Math.max(1, (guildManager.getQueuePage(guildId) || 1) - 1))
  },
  [BUTTON_PREFIXES.queuePageNext]: async (s, interaction, guildId, user) => {
    logger.event("button", "P\u00e1gina siguiente", { user, guildId })
    await refreshQueueMessage(interaction, guildManager.getQueuePage(guildId) + 1)
  },
  [BUTTON_PREFIXES.queuePlaybackPause]: async (s, interaction, guildId, user) => {
    s.togglePause()
    logger.event("button", "Pause/Resume toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackSkip]: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Saltando", { user, guildId })
    await refreshQueueMessage(interaction, 1)
  },
  [BUTTON_PREFIXES.queuePlaybackShuffle]: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Mezclando cola", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackStop]: async (s, interaction, guildId, user) => {
    s.destroy()
    logger.event("button", "Deteniendo reproducci\u00f3n", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackAutoplay]: async (s, interaction, guildId, user) => {
    await s.toggleAutoplay()
    guildManager.toggleAutoplayPref(guildId)
    logger.event("button", "Autoplay toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.nowPlayingPause]: async (s, interaction, guildId, user) => {
    s.pause()
    logger.event("button", "Now Playing pause", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u23f8 Pausado")
  },
  [BUTTON_PREFIXES.nowPlayingResume]: async (s, interaction, guildId, user) => {
    s.resume()
    logger.event("button", "Now Playing resume", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u25b6 Reanudado")
  },
  [BUTTON_PREFIXES.nowPlayingSkip]: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Now Playing skip", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\u23ed Saltado")
  },
  [BUTTON_PREFIXES.nowPlayingLoop]: async (s, interaction, guildId, user) => {
    const mode = s.toggleLoop()
    logger.event("button", "Now Playing loop", { user, guildId, mode })
    await clearButtonsAndFollowUp(interaction, LOOP_LABELS[mode])
  },
  [BUTTON_PREFIXES.nowPlayingShuffle]: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Now Playing shuffle", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "\ud83d\udd00 Cola mezclada")
  },
  [BUTTON_PREFIXES.nowPlayingSeekBack]: async (s, interaction, guildId, user) => {
    const pos = Math.max(0, s.getPosition() - SEEK_BACK_SECONDS)
    await s.seek(pos)
    logger.event("button", "Now Playing seek back", { user, guildId, position: pos })
    await clearButtonsAndFollowUp(interaction, "\u23ea -15s")
  },
  [BUTTON_PREFIXES.nowPlayingReshuffle]: async (s, interaction, guildId, user) => {
    const next = await s.reshuffleRadio()
    logger.event("button", "Now Playing reshuffle", { user, guildId, next: next?.title })
    await clearButtonsAndFollowUp(interaction, next ? `\ud83d\udd04 ${next.title}` : "\ud83d\udd04 Sin resultados")
    await updateQueueForGuild(guildId)
  },
}

async function clearButtonsAndFollowUp(interaction: ButtonInteraction, content: string) {
  await interaction.deferUpdate()
  await interaction.message.delete().catch(() => {})
  const guildId = interaction.guildId
  if (guildId) guildManager.clearNowPlayingMessage(guildId)
  await interaction.followUp({ content, ephemeral: true })
}
