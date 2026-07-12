import { ButtonInteraction } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { refreshQueueMessage, updateQueueForGuild } from "@/music/QueueUIManager"
import { logger } from "@/utils/logger"
import { requireSession } from "@/utils/guards"
import { BUTTON_PREFIXES } from "@/config/ui"
import { getErrorMessage } from "@/utils/error"

interface QueueButtonAction {
  action: (scheduler: import("../music/TrackScheduler").TrackScheduler, idx: number) => void
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

    logger.warn("button", "Acción no reconocida", { user, guildId, customId: interaction.customId })
    await interaction.reply({ content: "Acción no reconocida", ephemeral: true })
  } catch (error) {
    logger.error("button", "Error en botón", {
      user,
      guildId,
      customId: interaction.customId,
      error: getErrorMessage(error),
    })
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Error al ejecutar la acción")
      } else {
        await interaction.reply({ content: "Error al ejecutar la acción", ephemeral: true })
      }
    } catch { /* interaction might be expired */ }
  }
}

type ButtonHandler = (
  scheduler: import("../music/TrackScheduler").TrackScheduler,
  interaction: ButtonInteraction,
  guildId: string,
  user: string,
) => Promise<void>

const buttonHandlers: Record<string, ButtonHandler> = {
  [BUTTON_PREFIXES.queuePagePrev]: async (s, interaction, guildId, user) => {
    logger.event("button", "Página anterior", { user, guildId })
    await refreshQueueMessage(interaction, Math.max(1, (guildManager.getQueuePage(guildId) || 1) - 1))
  },
  [BUTTON_PREFIXES.queuePageNext]: async (s, interaction, guildId, user) => {
    logger.event("button", "Página siguiente", { user, guildId })
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
    logger.event("button", "Deteniendo reproducción", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  [BUTTON_PREFIXES.queuePlaybackAutoplay]: async (s, interaction, guildId, user) => {
    await s.toggleAutoplay()
    guildManager.toggleAutoplayPref(guildId)
    logger.event("button", "Autoplay toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
}
