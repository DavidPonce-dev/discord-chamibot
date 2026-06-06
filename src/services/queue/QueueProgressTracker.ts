import { GuildTextBasedChannel } from "discord.js"
import { guildManager, registerCleanup, registerPreDestroyCleanup } from "@/services/guild/GuildManager"
import { ensureQueueMessage, updateQueueForGuild, setQueuePage, clearQueuePage, cancelPendingUpdates } from "@/services/queue/QueueUIManager"
import { PROGRESS_UPDATE_INTERVAL_MS } from "@/config/timeouts"

const progressIntervals = new Map<string, NodeJS.Timeout>()

function updateProgress(guildId: string) {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || (!scheduler.getCurrentTrack() && scheduler.getSize() === 0)) {
    const iv = progressIntervals.get(guildId)
    if (iv) {
      clearInterval(iv)
      progressIntervals.delete(guildId)
    }
    return
  }
  const statusTitle = guildManager.getStatusTitle(guildId)
  updateQueueForGuild(guildId, statusTitle)
}

function startProgressUpdates(guildId: string) {
  stopProgressUpdates(guildId)
  progressIntervals.set(guildId, setInterval(() => updateProgress(guildId), PROGRESS_UPDATE_INTERVAL_MS))
}

function stopProgressUpdates(guildId: string) {
  const iv = progressIntervals.get(guildId)
  if (iv) {
    clearInterval(iv)
    progressIntervals.delete(guildId)
  }
}

registerCleanup(stopProgressUpdates)
registerPreDestroyCleanup(stopProgressUpdates)

export function setupSchedulerCallbacks(scheduler: import("../scheduler/TrackScheduler").TrackScheduler, guildId: string) {
  if (!scheduler.onTrackChange) {
    scheduler.onTrackChange = (gId) => {
      setQueuePage(gId, 1)
      const statusTitle = guildManager.getStatusTitle(gId)
      updateQueueForGuild(gId, statusTitle)
      const s = guildManager.get(gId)
      if (s?.getCurrentTrack()) {
        startProgressUpdates(gId)
      }
    }
  }

  if (!scheduler.onDisconnect) {
    scheduler.onDisconnect = (gId) => {
      stopProgressUpdates(gId)
      cancelPendingUpdates(gId)
      const msg = guildManager.getQueueMessage(gId)
      if (msg) msg.delete().catch(() => {})
      guildManager.clearQueueMessage(gId)
      guildManager.clearQueueChannel(gId)
      guildManager.clearStatusTitle(gId)
      clearQueuePage(gId)
      guildManager.delete(gId)
    }
  }
}

export async function initializeQueueDisplay(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  statusTitle: string,
  totalPages: number,
) {
  guildManager.setStatusTitle(guildId, statusTitle)
  if (!channel?.send) return
  await ensureQueueMessage(guildId, channel, statusTitle, totalPages)
  startProgressUpdates(guildId)
}
