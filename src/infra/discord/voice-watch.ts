import type { LoggerPort } from "../../domain/ports"
import type { MusicUseCases } from "../../usecases/music"
import { EMPTY_CHANNEL_LEAVE_MS } from "../../config/timeouts"

export type VoiceChange = Readonly<{
  guildId: string
  // The change is about the bot itself, not another member
  isSelf: boolean
  oldChannelId: string | null
  newChannelId: string | null
}>

type VoiceWatcherDeps = Readonly<{
  music: Pick<MusicUseCases, "getSession" | "setSession" | "destroySession">
  // Non-bot members currently in the voice channel
  countHumans: (guildId: string, channelId: string) => number
  logger: LoggerPort
  leaveDelayMs?: number
}>

export type VoiceWatcher = Readonly<{
  onVoiceStateUpdate: (change: VoiceChange) => void
}>

// Ends sessions nobody is listening to: without this the bot keeps streaming (and, with autoplay,
// resolving new tracks) forever after being kicked or left alone in the channel
export const createVoiceWatcher = (deps: VoiceWatcherDeps): VoiceWatcher => {
  const { music, countHumans, logger, leaveDelayMs = EMPTY_CHANNEL_LEAVE_MS } = deps
  const leaveTimers = new Map<string, NodeJS.Timeout>()

  const cancelLeave = (guildId: string): void => {
    const timer = leaveTimers.get(guildId)
    if (timer) {
      clearTimeout(timer)
      leaveTimers.delete(guildId)
    }
  }

  const isAlone = (guildId: string): boolean => {
    const channelId = music.getSession(guildId)?.voiceChannelId
    return !!channelId && countHumans(guildId, channelId) === 0
  }

  // The grace period covers people switching channels or reconnecting
  const evaluate = (guildId: string): void => {
    if (!isAlone(guildId)) {
      cancelLeave(guildId)
      return
    }
    if (leaveTimers.has(guildId)) return
    leaveTimers.set(guildId, setTimeout(() => {
      leaveTimers.delete(guildId)
      if (!isAlone(guildId)) return
      logger.info("voice", "Canal de voz sin oyentes, terminando la sesion", { guildId })
      music.destroySession(guildId)
    }, leaveDelayMs))
  }

  const onVoiceStateUpdate = (change: VoiceChange): void => {
    const { guildId, isSelf, oldChannelId, newChannelId } = change
    const session = music.getSession(guildId)
    if (!session) {
      cancelLeave(guildId)
      return
    }

    if (isSelf) {
      if (!newChannelId) {
        logger.info("voice", "El bot fue desconectado del canal de voz, terminando la sesion", { guildId })
        cancelLeave(guildId)
        music.destroySession(guildId)
        return
      }
      if (newChannelId !== session.voiceChannelId) {
        music.setSession(guildId, { ...session, voiceChannelId: newChannelId })
        cancelLeave(guildId)
      }
      evaluate(guildId)
      return
    }

    const channelId = session.voiceChannelId
    if (oldChannelId === channelId || newChannelId === channelId) evaluate(guildId)
  }

  return { onVoiceStateUpdate } as const
}
