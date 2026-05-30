import { ButtonInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { refreshQueueMessage, getQueuePage } from "@/services/queue/QueueUIManager"
import { logger } from "@/utils/logger"
import { requireSession, requireGuild } from "@/utils/guards"
import { LOOP_LABELS } from "@/config/ui"
import { BUTTON_COOLDOWN_MS, SEEK_BACK_SECONDS } from "@/config/timeouts"
import { getErrorMessage } from "@/utils/error"

const userCooldowns = new Map<string, number>()

function isOnCooldown(userId: string): boolean {
  const last = userCooldowns.get(userId)
  if (!last) return false
  return Date.now() - last < BUTTON_COOLDOWN_MS
}

function setCooldown(userId: string) {
  userCooldowns.set(userId, Date.now())
}

interface QueueButtonAction {
  action: (scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler, idx: number) => void
  logEvent: string
}

const queueIndexActions: Record<string, QueueButtonAction> = {
  q_up_: { action: (s, idx) => s.moveUp(idx), logEvent: "Subir track" },
  q_down_: { action: (s, idx) => s.moveDown(idx), logEvent: "Bajar track" },
  q_del_: { action: (s, idx) => s.remove(idx), logEvent: "Eliminar de cola" },
}

export async function handleButton(interaction: ButtonInteraction) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const user = interaction.user.username
  const userId = interaction.user.id

  if (isOnCooldown(userId)) {
    await interaction.reply({ content: "Esperá un momento antes de usar otro botón", ephemeral: true }).catch(() => {})
    return
  }

  setCooldown(userId)
  const scheduler = requireSession(interaction)

  if (!scheduler) {
    logger.warn("button", "Botón sin sesión activa", { user, guildId, customId: interaction.customId })
    return
  }

  try {
    // Handle queue index buttons (q_up_N, q_down_N, q_del_N)
    for (const [prefix, { action, logEvent }] of Object.entries(queueIndexActions)) {
      if (interaction.customId.startsWith(prefix)) {
        const idx = parseInt(interaction.customId.slice(prefix.length), 10)
        action(scheduler, idx)
        logger.event("button", logEvent, { user, guildId, index: idx })
        await refreshQueueMessage(interaction)
        return
      }
    }

    // Handle exact-match buttons
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
  scheduler: import("../services/scheduler/TrackScheduler").TrackScheduler,
  interaction: ButtonInteraction,
  guildId: string,
  user: string,
) => Promise<void>

const buttonHandlers: Record<string, ButtonHandler> = {
  // Queue navigation
  q_page_prev: async (s, interaction, guildId, user) => {
    logger.event("button", "Página anterior", { user, guildId })
    await refreshQueueMessage(interaction, Math.max(1, (getQueuePage(guildId) || 1) - 1))
  },
  q_page_next: async (s, interaction, guildId, user) => {
    logger.event("button", "Página siguiente", { user, guildId })
    await refreshQueueMessage(interaction, getQueuePage(guildId) + 1)
  },

  // Queue playback
  q_playback_pause: async (s, interaction, guildId, user) => {
    s.togglePause()
    logger.event("button", "Pause/Resume toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  q_playback_skip: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Saltando", { user, guildId })
    await refreshQueueMessage(interaction, 1)
  },
  q_playback_shuffle: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Mezclando cola", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  q_playback_clear: async (s, interaction, guildId, user) => {
    s.clear()
    logger.event("button", "Limpiando cola", { user, guildId })
    await refreshQueueMessage(interaction)
  },
  q_playback_autoplay: async (s, interaction, guildId, user) => {
    s.toggleAutoplay()
    guildManager.toggleAutoplayPref(guildId)
    logger.event("button", "Autoplay toggle", { user, guildId })
    await refreshQueueMessage(interaction)
  },

  // Now Playing controls
  np_pause: async (s, interaction, guildId, user) => {
    s.pause()
    logger.event("button", "Now Playing pause", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "⏸ Pausado")
  },
  np_resume: async (s, interaction, guildId, user) => {
    s.resume()
    logger.event("button", "Now Playing resume", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "▶ Reanudado")
  },
  np_skip: async (s, interaction, guildId, user) => {
    s.skip()
    logger.event("button", "Now Playing skip", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "⏭ Saltado")
  },
  np_loop: async (s, interaction, guildId, user) => {
    const mode = s.toggleLoop()
    logger.event("button", "Now Playing loop", { user, guildId, mode })
    await clearButtonsAndFollowUp(interaction, LOOP_LABELS[mode])
  },
  np_shuffle: async (s, interaction, guildId, user) => {
    s.shuffle()
    logger.event("button", "Now Playing shuffle", { user, guildId })
    await clearButtonsAndFollowUp(interaction, "🔀 Cola mezclada")
  },
  np_seek_back: async (s, interaction, guildId, user) => {
    const pos = Math.max(0, s.getPosition() - SEEK_BACK_SECONDS)
    await s.seek(pos)
    logger.event("button", "Now Playing seek back", { user, guildId, position: pos })
    await clearButtonsAndFollowUp(interaction, "⏪ -15s")
  },
}

async function clearButtonsAndFollowUp(interaction: ButtonInteraction, content: string) {
  await interaction.update({ components: [] })
  await interaction.followUp({ content, ephemeral: true })
}
