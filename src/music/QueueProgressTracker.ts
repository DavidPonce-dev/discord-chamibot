import { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { ensureQueueMessage, updateQueueForGuild, cleanupQueueUI } from "@/music/QueueUIManager"
import { isQueueEmpty } from "@/utils/guards"
import { PROGRESS_UPDATE_INTERVAL_MS } from "@/config/timeouts"

const progressIntervals = new Map<string, NodeJS.Timeout>()

function updateProgress(guildId: string) {
  const scheduler = guildManager.get(guildId)
  if (isQueueEmpty(scheduler)) {
    const iv = progressIntervals.get(guildId)
    if (iv) {
      clearInterval(iv)
      progressIntervals.delete(guildId)
    }
    return
  }
  if (!scheduler!.isConnected()) {
    stopProgressUpdates(guildId)
    return
  }
  updateQueueForGuild(guildId)
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

export function setupSchedulerCallbacks(scheduler: import("./TrackScheduler").TrackScheduler, guildId: string) {
  scheduler.onTrackChange = (gId) => {
    guildManager.setQueuePage(gId, 1)
    updateQueueForGuild(gId)
    const s = guildManager.get(gId)
    if (s?.getCurrentTrack()) {
      startProgressUpdates(gId)
    }
  }

  scheduler.onDisconnect = (gId) => {
    stopProgressUpdates(gId)
    cleanupQueueUI(gId)
    guildManager.delete(gId)
  }
}

export async function initializeQueueDisplay(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  totalPages: number,
) {
  if (!channel?.send) return
  await ensureQueueMessage(guildId, channel, totalPages)
  startProgressUpdates(guildId)
}
