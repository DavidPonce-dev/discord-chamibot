import { GuildTextBasedChannel } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { registerCleanup, registerPreDestroyCleanup } from "@/services/guild/cleanupRegistry"
import { ensureQueueMessage, updateQueueForGuild, setQueuePage, cleanupQueueUI } from "@/services/queue/QueueUIManager"
import { isQueueEmpty } from "@/utils/guards"
import { PROGRESS_UPDATE_INTERVAL_MS } from "@/config/timeouts"

const progressIntervals = new Map<string, NodeJS.Timeout>()
const callbacksSetup = new Set<string>()

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

registerCleanup(stopProgressUpdates)
registerPreDestroyCleanup(stopProgressUpdates)

export function setupSchedulerCallbacks(scheduler: import("../scheduler/TrackScheduler").TrackScheduler, guildId: string) {
  if (callbacksSetup.has(guildId)) return

  callbacksSetup.add(guildId)

  scheduler.onTrackChange = (gId) => {
    setQueuePage(gId, 1)
    updateQueueForGuild(gId)
    const s = guildManager.get(gId)
    if (s?.getCurrentTrack()) {
      startProgressUpdates(gId)
    }
  }

  scheduler.onDisconnect = (gId) => {
    callbacksSetup.delete(gId)
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
